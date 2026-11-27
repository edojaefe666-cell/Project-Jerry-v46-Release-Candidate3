/**
 * Client-side encryption for Jerry memory records.
 * All user-visible fields, including title/content/category/area/tags/outcome,
 * logical timestamps, and logical deletion state, are inside AES-256-GCM.
 */
import type { MemoryEntry, JerryMemoryArea } from './types.ts';

export interface EncryptedMemoryPayload {
  schemaVersion: 1;
  id: string;
  category: MemoryEntry['category'];
  area: JerryMemoryArea;
  title: string;
  content: string;
  outcome?: MemoryEntry['outcome'];
  tags: string[];
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
}
export interface EncryptedMemoryRecord {
  schemaVersion: 1;
  recordId: string;
  keyVersion: number;
  revision: number;
  iv: string;
  ciphertext: string;
}
export interface MemoryRecordContext {
  ownerUid: string;
  recordId: string;
  keyVersion: number;
  revision: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const MAX_CIPHERTEXT_CHARS = 64_000;
const CATEGORIES = new Set(['goal', 'decision', 'lesson', 'preference', 'workflow']);
const AREAS = new Set(['owner_profile', 'mission_projects', 'knowledge_experience']);
const OUTCOMES = new Set(['success', 'correction', 'insight']);

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}
function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function decodeBase64Url(value: string, maxChars: number): Uint8Array {
  if (typeof value !== 'string' || !value || value.length > maxChars ||
      !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Encrypted memory encoding is invalid.');
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') +
    '='.repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}
function validateContext(context: MemoryRecordContext): void {
  if (!context || typeof context.ownerUid !== 'string' || !context.ownerUid.trim() ||
      context.ownerUid.length > 160 || typeof context.recordId !== 'string' ||
      !/^[A-Za-z0-9_-]{16,128}$/.test(context.recordId) ||
      !Number.isSafeInteger(context.keyVersion) || context.keyVersion < 1 ||
      !Number.isSafeInteger(context.revision) || context.revision < 1) {
    throw new Error('Encrypted memory context is invalid.');
  }
}
function aadFor(context: MemoryRecordContext): Uint8Array {
  validateContext(context);
  return encoder.encode(JSON.stringify({
    purpose: 'jerry-memory-record-v1',
    ownerUid: context.ownerUid,
    recordId: context.recordId,
    keyVersion: context.keyVersion,
    revision: context.revision,
    schemaVersion: 1,
  }));
}
function validatePayload(value: unknown, recordId: string): asserts value is EncryptedMemoryPayload {
  if (!value || typeof value !== 'object') throw new Error('Encrypted memory payload is invalid.');
  const payload = value as Record<string, unknown>;
  if (payload.schemaVersion !== 1 || payload.id !== recordId ||
      typeof payload.category !== 'string' || !CATEGORIES.has(payload.category) ||
      typeof payload.area !== 'string' || !AREAS.has(payload.area) ||
      typeof payload.title !== 'string' || !payload.title.trim() || payload.title.length > 240 ||
      typeof payload.content !== 'string' || !payload.content.trim() || payload.content.length > 20_000 ||
      !Array.isArray(payload.tags) || payload.tags.length > 30 ||
      payload.tags.some((tag) => typeof tag !== 'string' || tag.length > 80) ||
      typeof payload.createdAt !== 'string' || Number.isNaN(Date.parse(payload.createdAt)) ||
      typeof payload.updatedAt !== 'string' || Number.isNaN(Date.parse(payload.updatedAt)) ||
      typeof payload.deleted !== 'boolean' ||
      (payload.outcome !== undefined && (typeof payload.outcome !== 'string' || !OUTCOMES.has(payload.outcome)))) {
    throw new Error('Encrypted memory payload fields are invalid.');
  }
}

export async function encryptMemoryRecord(
  payload: EncryptedMemoryPayload,
  key: CryptoKey,
  context: MemoryRecordContext,
  cryptoProvider: Crypto = globalThis.crypto,
): Promise<EncryptedMemoryRecord> {
  validateContext(context);
  validatePayload(payload, context.recordId);
  if (key.type !== 'secret' || key.algorithm.name !== 'AES-GCM' || key.extractable) {
    throw new Error('Memory encryption requires a non-extractable AES-GCM key.');
  }
  const iv = cryptoProvider.getRandomValues(new Uint8Array(12));
  const plaintext = encoder.encode(JSON.stringify(payload));
  let encrypted: ArrayBuffer;
  try {
    encrypted = await cryptoProvider.subtle.encrypt({
      name: 'AES-GCM', iv: toArrayBuffer(iv),
      additionalData: toArrayBuffer(aadFor(context)), tagLength: 128,
    }, key, toArrayBuffer(plaintext));
  } finally {
    plaintext.fill(0);
  }
  const ciphertext = encodeBase64Url(new Uint8Array(encrypted));
  if (ciphertext.length > MAX_CIPHERTEXT_CHARS) throw new Error('Encrypted memory record is too large.');
  return {
    schemaVersion: 1, recordId: context.recordId,
    keyVersion: context.keyVersion, revision: context.revision,
    iv: encodeBase64Url(iv), ciphertext,
  };
}

export async function decryptMemoryRecord(
  record: EncryptedMemoryRecord,
  key: CryptoKey,
  context: MemoryRecordContext,
  cryptoProvider: Crypto = globalThis.crypto,
): Promise<EncryptedMemoryPayload> {
  validateContext(context);
  if (!record || record.schemaVersion !== 1 || record.recordId !== context.recordId ||
      record.keyVersion !== context.keyVersion || record.revision !== context.revision ||
      key.type !== 'secret' || key.algorithm.name !== 'AES-GCM') {
    throw new Error('Encrypted memory record does not match its authenticated context.');
  }
  const iv = decodeBase64Url(record.iv, 32);
  const ciphertext = decodeBase64Url(record.ciphertext, MAX_CIPHERTEXT_CHARS);
  if (iv.byteLength !== 12 || ciphertext.byteLength < 17) {
    throw new Error('Encrypted memory record has invalid cryptographic lengths.');
  }
  const plaintext = new Uint8Array(await cryptoProvider.subtle.decrypt({
    name: 'AES-GCM', iv: toArrayBuffer(iv),
    additionalData: toArrayBuffer(aadFor(context)), tagLength: 128,
  }, key, toArrayBuffer(ciphertext)));
  try {
    const parsed: unknown = JSON.parse(decoder.decode(plaintext));
    validatePayload(parsed, context.recordId);
    return parsed;
  } finally {
    plaintext.fill(0);
  }
}
