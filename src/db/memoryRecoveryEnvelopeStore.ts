import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from './index.ts';
import { memoryRecoveryEnvelopes } from './schema.ts';
import { getOrCreateUser } from './users.ts';

export interface OwnerMemoryRecoveryEnvelopeInput {
  version: 1;
  algorithm: 'HKDF-SHA256-AES-256-GCM';
  context: { ownerUid: string; keyVersion: number };
  salt: string;
  iv: string;
  ciphertext: string;
}

export interface StoredOwnerMemoryRecoveryEnvelope extends OwnerMemoryRecoveryEnvelopeInput {
  id: string;
  createdAt: string;
}

export function validateOwnerMemoryRecoveryEnvelope(value: unknown, ownerUid: string, expectedKeyVersion?: number): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'An owner memory recovery envelope is required.';
  const envelope = value as Record<string, unknown>;
  const allowed = new Set(['version', 'algorithm', 'context', 'salt', 'iv', 'ciphertext']);
  if (Object.keys(envelope).some((key) => !allowed.has(key))) return 'Recovery envelope contains unsupported fields.';
  if (envelope.version !== 1 || envelope.algorithm !== 'HKDF-SHA256-AES-256-GCM') {
    return 'Recovery envelope version or algorithm is unsupported.';
  }
  const context = envelope.context as Record<string, unknown> | null;
  if (!context || typeof context !== 'object' || Array.isArray(context) ||
      Object.keys(context).some((key) => !['ownerUid', 'keyVersion'].includes(key)) ||
      context.ownerUid !== ownerUid || typeof context.ownerUid !== 'string' ||
      !Number.isSafeInteger(context.keyVersion) || (context.keyVersion as number) < 1 ||
      (expectedKeyVersion !== undefined && context.keyVersion !== expectedKeyVersion)) {
    return 'Recovery envelope owner or key-version context is invalid.';
  }
  if (typeof envelope.salt !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(envelope.salt) ||
      typeof envelope.iv !== 'string' || !/^[A-Za-z0-9_-]{16}$/.test(envelope.iv) ||
      typeof envelope.ciphertext !== 'string' || !/^[A-Za-z0-9_-]{64}$/.test(envelope.ciphertext)) {
    return 'Recovery envelope cryptographic fields have invalid encoding or length.';
  }
  return null;
}

/** Stores ciphertext only. The 256-bit recovery secret is never accepted by this API. */
export async function createOwnerMemoryRecoveryEnvelopeForUser(
  uid: string,
  email: string,
  envelope: OwnerMemoryRecoveryEnvelopeInput,
): Promise<StoredOwnerMemoryRecoveryEnvelope> {
  const validationError = validateOwnerMemoryRecoveryEnvelope(envelope, uid);
  if (validationError) throw new Error(validationError);
  const user = await getOrCreateUser(uid, email);
  const [row] = await db.insert(memoryRecoveryEnvelopes).values({
    id: randomUUID(),
    userId: user.id,
    keyVersion: envelope.context.keyVersion,
    envelopeVersion: envelope.version,
    algorithm: envelope.algorithm,
    salt: envelope.salt,
    iv: envelope.iv,
    ciphertext: envelope.ciphertext,
  }).returning();
  if (!row) throw new Error('Owner recovery envelope was not stored.');
  return {
    id: row.id,
    version: 1,
    algorithm: 'HKDF-SHA256-AES-256-GCM',
    context: { ownerUid: uid, keyVersion: row.keyVersion },
    salt: row.salt,
    iv: row.iv,
    ciphertext: row.ciphertext,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Recovery envelope is immutable per owner/key version; no overwrite endpoint exists. */
export async function getOwnerMemoryRecoveryEnvelopeForUser(
  uid: string,
  email: string,
  keyVersion: number,
): Promise<StoredOwnerMemoryRecoveryEnvelope | null> {
  if (!Number.isSafeInteger(keyVersion) || keyVersion < 1) return null;
  const user = await getOrCreateUser(uid, email);
  const [row] = await db.select().from(memoryRecoveryEnvelopes).where(and(
    eq(memoryRecoveryEnvelopes.userId, user.id),
    eq(memoryRecoveryEnvelopes.keyVersion, keyVersion),
  )).limit(1);
  if (!row) return null;
  return {
    id: row.id,
    version: 1,
    algorithm: 'HKDF-SHA256-AES-256-GCM',
    context: { ownerUid: uid, keyVersion: row.keyVersion },
    salt: row.salt,
    iv: row.iv,
    ciphertext: row.ciphertext,
    createdAt: row.createdAt.toISOString(),
  };
}
