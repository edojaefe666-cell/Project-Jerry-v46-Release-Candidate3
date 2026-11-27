import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from './index.ts';
import { deviceMemoryKeyEnvelopes, deviceRegistrations } from './schema.ts';
import { getOrCreateUser } from './users.ts';

export interface StoredDeviceMemoryKeyEnvelope {
  id: string;
  keyVersion: number;
  envelopeVersion: 1;
  algorithm: 'ECDH-P256-HKDF-SHA256-AES-256-GCM';
  context: { ownerUid: string; deviceId: string; keyVersion: number };
  ephemeralPublicKey: { kty: 'EC'; crv: 'P-256'; x: string; y: string };
  salt: string;
  iv: string;
  ciphertext: string;
  createdAt: string;
}

export interface DeviceMemoryKeyEnvelopeInput {
  version: 1;
  algorithm: 'ECDH-P256-HKDF-SHA256-AES-256-GCM';
  context: { ownerUid: string; deviceId: string; keyVersion: number };
  ephemeralPublicKey: { kty: 'EC'; crv: 'P-256'; x: string; y: string };
  salt: string;
  iv: string;
  ciphertext: string;
}

export function validateDeviceMemoryKeyEnvelope(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'A device memory-key envelope is required.';
  const envelope = value as Record<string, unknown>;
  const allowed = new Set(['version', 'algorithm', 'context', 'ephemeralPublicKey', 'salt', 'iv', 'ciphertext']);
  if (Object.keys(envelope).some((key) => !allowed.has(key))) return 'Envelope contains unsupported fields.';
  if (envelope.version !== 1 || envelope.algorithm !== 'ECDH-P256-HKDF-SHA256-AES-256-GCM') {
    return 'Envelope version or algorithm is unsupported.';
  }
  const context = envelope.context as Record<string, unknown> | null;
  if (!context || typeof context !== 'object' || Array.isArray(context) ||
      Object.keys(context).some((key) => !['ownerUid', 'deviceId', 'keyVersion'].includes(key)) ||
      typeof context.ownerUid !== 'string' || !context.ownerUid.trim() || context.ownerUid.length > 160 ||
      typeof context.deviceId !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(context.deviceId) ||
      !Number.isSafeInteger(context.keyVersion) || (context.keyVersion as number) < 1) {
    return 'Envelope owner, device, or key-version context is invalid.';
  }
  const publicKey = envelope.ephemeralPublicKey as Record<string, unknown> | null;
  if (!publicKey || typeof publicKey !== 'object' || Array.isArray(publicKey) ||
      Object.keys(publicKey).some((key) => !['kty', 'crv', 'x', 'y'].includes(key)) ||
      publicKey.kty !== 'EC' || publicKey.crv !== 'P-256' ||
      typeof publicKey.x !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(publicKey.x) ||
      typeof publicKey.y !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(publicKey.y)) {
    return 'Envelope ephemeral public key is invalid or contains private material.';
  }
  if (typeof envelope.salt !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(envelope.salt) ||
      typeof envelope.iv !== 'string' || !/^[A-Za-z0-9_-]{16}$/.test(envelope.iv) ||
      typeof envelope.ciphertext !== 'string' || !/^[A-Za-z0-9_-]{64}$/.test(envelope.ciphertext)) {
    return 'Envelope cryptographic fields have invalid encoding or length.';
  }
  return null;
}

function toStored(row: typeof deviceMemoryKeyEnvelopes.$inferSelect, uid: string, deviceId: string): StoredDeviceMemoryKeyEnvelope {
  return {
    id: row.id,
    keyVersion: row.keyVersion,
    envelopeVersion: 1,
    algorithm: 'ECDH-P256-HKDF-SHA256-AES-256-GCM',
    context: { ownerUid: uid, deviceId, keyVersion: row.keyVersion },
    ephemeralPublicKey: row.ephemeralPublicKey as StoredDeviceMemoryKeyEnvelope['ephemeralPublicKey'],
    salt: row.salt,
    iv: row.iv,
    ciphertext: row.ciphertext,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Persists a wrapped data key only when both the recipient and authorizing
 * device are already active under this owner. Caller must have verified the
 * authorizing device's purpose-bound signature before reaching this function.
 */
export async function createDeviceMemoryKeyEnvelopeForUser(
  uid: string,
  email: string,
  recipientDeviceId: string,
  authorizedByDeviceId: string,
  envelope: DeviceMemoryKeyEnvelopeInput,
): Promise<StoredDeviceMemoryKeyEnvelope> {
  const validationError = validateDeviceMemoryKeyEnvelope(envelope);
  if (validationError) throw new Error(validationError);
  if (envelope.context.ownerUid !== uid || envelope.context.deviceId !== recipientDeviceId) {
    throw new Error('Envelope context does not match the authenticated owner and recipient device.');
  }
  if (recipientDeviceId === authorizedByDeviceId) {
    // A device may wrap its own key only after an existing owner-approved flow
    // has explicitly authorized this operation; API route enforces that proof.
  }
  const user = await getOrCreateUser(uid, email);
  return db.transaction(async (tx) => {
    const [recipient] = await tx.select().from(deviceRegistrations).where(and(
      eq(deviceRegistrations.userId, user.id),
      eq(deviceRegistrations.deviceId, recipientDeviceId),
      eq(deviceRegistrations.status, 'active'),
    )).limit(1).for('update');
    const [authorizer] = await tx.select().from(deviceRegistrations).where(and(
      eq(deviceRegistrations.userId, user.id),
      eq(deviceRegistrations.deviceId, authorizedByDeviceId),
      eq(deviceRegistrations.status, 'active'),
    )).limit(1).for('share');
    if (!recipient || !authorizer) throw new Error('Both recipient and authorizing devices must be owner-approved and active.');
    const [row] = await tx.insert(deviceMemoryKeyEnvelopes).values({
      id: randomUUID(),
      userId: user.id,
      deviceRegistrationId: recipient.id,
      createdByDeviceRegistrationId: authorizer.id,
      keyVersion: envelope.context.keyVersion,
      envelopeVersion: envelope.version,
      algorithm: envelope.algorithm,
      ephemeralPublicKey: envelope.ephemeralPublicKey,
      salt: envelope.salt,
      iv: envelope.iv,
      ciphertext: envelope.ciphertext,
      status: 'active',
    }).returning();
    if (!row) throw new Error('Device memory-key envelope could not be stored.');
    return toStored(row, uid, recipientDeviceId);
  });
}

/** Delivers an envelope only to its currently active, owner-approved device. */
export async function getDeviceMemoryKeyEnvelopeForUser(
  uid: string,
  email: string,
  recipientDeviceId: string,
  keyVersion: number,
): Promise<StoredDeviceMemoryKeyEnvelope | null> {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(recipientDeviceId) ||
      !Number.isSafeInteger(keyVersion) || keyVersion < 1) return null;
  const user = await getOrCreateUser(uid, email);
  const [row] = await db.select({ envelope: deviceMemoryKeyEnvelopes, device: deviceRegistrations })
    .from(deviceMemoryKeyEnvelopes)
    .innerJoin(deviceRegistrations, eq(deviceMemoryKeyEnvelopes.deviceRegistrationId, deviceRegistrations.id))
    .where(and(
      eq(deviceMemoryKeyEnvelopes.userId, user.id),
      eq(deviceMemoryKeyEnvelopes.keyVersion, keyVersion),
      eq(deviceMemoryKeyEnvelopes.status, 'active'),
      eq(deviceRegistrations.userId, user.id),
      eq(deviceRegistrations.deviceId, recipientDeviceId),
      eq(deviceRegistrations.status, 'active'),
    )).limit(1);
  return row ? toStored(row.envelope, uid, recipientDeviceId) : null;
}

/** Revocation immediately makes all of this device's envelopes undeliverable. */
export async function revokeDeviceMemoryKeyEnvelopesForUser(
  uid: string,
  email: string,
  recipientDeviceId: string,
): Promise<number> {
  const user = await getOrCreateUser(uid, email);
  return db.transaction(async (tx) => {
    const [device] = await tx.select({ id: deviceRegistrations.id }).from(deviceRegistrations)
      .where(and(
        eq(deviceRegistrations.userId, user.id),
        eq(deviceRegistrations.deviceId, recipientDeviceId),
      )).limit(1);
    if (!device) return 0;
    const rows = await tx.update(deviceMemoryKeyEnvelopes)
      .set({ status: 'revoked', revokedAt: new Date() })
      .where(and(
        eq(deviceMemoryKeyEnvelopes.userId, user.id),
        eq(deviceMemoryKeyEnvelopes.deviceRegistrationId, device.id),
        eq(deviceMemoryKeyEnvelopes.status, 'active'),
      )).returning({ id: deviceMemoryKeyEnvelopes.id });
    return rows.length;
  });
}
