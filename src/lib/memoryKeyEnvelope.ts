/**
 * Client-side envelope primitives for Jerry's multi-device encrypted memory.
 *
 * The server may store DeviceKeyEnvelope records, but it must never receive
 * plaintext memory-key bytes or a device private key. Device enrollment,
 * owner authorization, key persistence, and recovery are separate steps and
 * must be completed before these primitives are used in production.
 */
export interface MemoryKeyContext {
  ownerUid: string;
  deviceId: string;
  keyVersion: number;
}

export interface DevicePublicKey {
  kty: 'EC';
  crv: 'P-256';
  x: string;
  y: string;
  ext?: boolean;
  key_ops?: string[];
}

export interface DeviceKeyEnvelope {
  version: 1;
  algorithm: 'ECDH-P256-HKDF-SHA256-AES-256-GCM';
  context: MemoryKeyContext;
  ephemeralPublicKey: DevicePublicKey;
  salt: string;
  iv: string;
  ciphertext: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const CONTEXT_FIELDS = ['ownerUid', 'deviceId', 'keyVersion'] as const;

function validateContext(context: MemoryKeyContext): void {
  if (!context || typeof context.ownerUid !== 'string' || !context.ownerUid.trim() ||
      context.ownerUid.length > 160 || typeof context.deviceId !== 'string' ||
      !context.deviceId.trim() || context.deviceId.length > 160 ||
      !Number.isSafeInteger(context.keyVersion) || context.keyVersion < 1) {
    throw new Error('Memory key context is invalid.');
  }
}

function canonicalContext(context: MemoryKeyContext): Uint8Array {
  validateContext(context);
  return encoder.encode(JSON.stringify({
    ownerUid: context.ownerUid,
    deviceId: context.deviceId,
    keyVersion: context.keyVersion,
  }));
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string, maxLength: number): Uint8Array {
  if (typeof value !== 'string' || !value || value.length > maxLength ||
      !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error('Memory key envelope encoding is invalid.');
  }
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') +
    '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export async function createDeviceKeyPair(cryptoProvider: Crypto = globalThis.crypto): Promise<{
  privateKey: CryptoKey;
  publicKey: DevicePublicKey;
}> {
  const pair = await cryptoProvider.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits'],
  ) as CryptoKeyPair;
  const publicKey = await cryptoProvider.subtle.exportKey('jwk', pair.publicKey) as DevicePublicKey;
  if (publicKey.kty !== 'EC' || publicKey.crv !== 'P-256' || !publicKey.x || !publicKey.y) {
    throw new Error('Generated device public key is invalid.');
  }
  return { privateKey: pair.privateKey, publicKey };
}

export function generateMemoryKeyBytes(cryptoProvider: Crypto = globalThis.crypto): Uint8Array {
  return cryptoProvider.getRandomValues(new Uint8Array(32));
}

export async function importMemoryDataKey(
  rawKey: Uint8Array,
  cryptoProvider: Crypto = globalThis.crypto,
): Promise<CryptoKey> {
  if (!(rawKey instanceof Uint8Array) || rawKey.byteLength !== 32) {
    throw new Error('Memory data key must contain exactly 32 bytes.');
  }
  return cryptoProvider.subtle.importKey('raw', rawKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function deriveEnvelopeKey(
  privateKey: CryptoKey,
  publicKey: DevicePublicKey,
  salt: Uint8Array,
  contextBytes: Uint8Array,
  cryptoProvider: Crypto,
): Promise<CryptoKey> {
  const recipientPublic = await cryptoProvider.subtle.importKey(
    'jwk', publicKey, { name: 'ECDH', namedCurve: 'P-256' }, false, [],
  );
  const sharedBits = await cryptoProvider.subtle.deriveBits(
    { name: 'ECDH', public: recipientPublic }, privateKey, 256,
  );
  const hkdfKey = await cryptoProvider.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
  return cryptoProvider.subtle.deriveKey({
    name: 'HKDF',
    hash: 'SHA-256',
    salt,
    info: encoder.encode('Jerry memory key envelope v1\u0000' + decoder.decode(contextBytes)),
  }, hkdfKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function wrapMemoryKeyForDevice(
  rawMemoryKey: Uint8Array,
  recipientPublicKey: DevicePublicKey,
  context: MemoryKeyContext,
  cryptoProvider: Crypto = globalThis.crypto,
): Promise<DeviceKeyEnvelope> {
  if (!(rawMemoryKey instanceof Uint8Array) || rawMemoryKey.byteLength !== 32) {
    throw new Error('Memory data key must contain exactly 32 bytes.');
  }
  const contextBytes = canonicalContext(context);
  const ephemeral = await createDeviceKeyPair(cryptoProvider);
  const salt = cryptoProvider.getRandomValues(new Uint8Array(32));
  const iv = cryptoProvider.getRandomValues(new Uint8Array(12));
  const wrappingKey = await deriveEnvelopeKey(
    ephemeral.privateKey, recipientPublicKey, salt, contextBytes, cryptoProvider,
  );
  const ciphertext = await cryptoProvider.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: contextBytes, tagLength: 128 },
    wrappingKey,
    rawMemoryKey,
  );
  return {
    version: 1,
    algorithm: 'ECDH-P256-HKDF-SHA256-AES-256-GCM',
    context: { ownerUid: context.ownerUid, deviceId: context.deviceId, keyVersion: context.keyVersion },
    ephemeralPublicKey: ephemeral.publicKey,
    salt: toBase64Url(salt),
    iv: toBase64Url(iv),
    ciphertext: toBase64Url(new Uint8Array(ciphertext)),
  };
}

export async function unwrapMemoryKeyForDevice(
  envelope: DeviceKeyEnvelope,
  recipientPrivateKey: CryptoKey,
  expectedContext: MemoryKeyContext,
  cryptoProvider: Crypto = globalThis.crypto,
): Promise<CryptoKey> {
  if (!envelope || envelope.version !== 1 ||
      envelope.algorithm !== 'ECDH-P256-HKDF-SHA256-AES-256-GCM') {
    throw new Error('Memory key envelope version or algorithm is unsupported.');
  }
  const contextBytes = canonicalContext(expectedContext);
  const actualContextBytes = canonicalContext(envelope.context);
  if (decoder.decode(contextBytes) !== decoder.decode(actualContextBytes)) {
    throw new Error('Memory key envelope context does not match this device.');
  }
  const salt = fromBase64Url(envelope.salt, 64);
  const iv = fromBase64Url(envelope.iv, 32);
  const ciphertext = fromBase64Url(envelope.ciphertext, 256);
  if (salt.byteLength !== 32 || iv.byteLength !== 12 || ciphertext.byteLength !== 48) {
    throw new Error('Memory key envelope has invalid cryptographic field lengths.');
  }
  const wrappingKey = await deriveEnvelopeKey(
    recipientPrivateKey, envelope.ephemeralPublicKey, salt, contextBytes, cryptoProvider,
  );
  const rawKey = new Uint8Array(await cryptoProvider.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: contextBytes, tagLength: 128 },
    wrappingKey,
    ciphertext,
  ));
  try {
    return await importMemoryDataKey(rawKey, cryptoProvider);
  } finally {
    rawKey.fill(0);
  }
}

export function isMemoryKeyContext(value: unknown): value is MemoryKeyContext {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return CONTEXT_FIELDS.every((field) => field in candidate) &&
    typeof candidate.ownerUid === 'string' && typeof candidate.deviceId === 'string' &&
    typeof candidate.keyVersion === 'number' && Number.isSafeInteger(candidate.keyVersion);
}
