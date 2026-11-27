import { and, eq, gt, isNull } from 'drizzle-orm';
import { randomBytes, randomUUID } from 'node:crypto';
import { db } from './index.ts';
import { deviceHttpRequestChallenges, deviceRegistrations } from './schema.ts';
import { getOrCreateUser } from './users.ts';
import { isAllowedEncryptedMemoryTarget, type DeviceHttpRequestChallenge } from '../lib/deviceHttpRequestProof.ts';

const CHALLENGE_TTL_MS = 60_000;

export interface StoredDeviceHttpRequestChallenge extends DeviceHttpRequestChallenge {
  signingPublicKey: { kty: 'EC'; crv: 'P-256'; x: string; y: string };
}

/** Creates a single-operation challenge only for a currently active owner device. */
export async function createDeviceHttpRequestChallengeForUser(
  uid: string,
  email: string,
  deviceId: string,
  method: string,
  path: string,
  bodySha256: string,
): Promise<DeviceHttpRequestChallenge> {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(deviceId) ||
      !isAllowedEncryptedMemoryTarget(method, path) ||
      !/^[A-Za-z0-9_-]{43}$/.test(bodySha256)) {
    throw new Error('Encrypted-memory request target is invalid.');
  }
  const user = await getOrCreateUser(uid, email);
  const [device] = await db.select({ id: deviceRegistrations.id })
    .from(deviceRegistrations)
    .where(and(
      eq(deviceRegistrations.userId, user.id),
      eq(deviceRegistrations.deviceId, deviceId),
      eq(deviceRegistrations.status, 'active'),
    )).limit(1);
  if (!device) throw new Error('An active owner-approved device is required.');
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
  const challengeId = randomUUID();
  const nonce = randomBytes(32).toString('base64url');
  await db.insert(deviceHttpRequestChallenges).values({
    id: challengeId, userId: user.id, deviceRegistrationId: device.id,
    nonce, method, path, bodySha256, expiresAt,
  });
  return {
    challengeId, nonce, ownerUid: uid, deviceId,
    method: method as DeviceHttpRequestChallenge['method'],
    path, bodySha256, expiresAt: expiresAt.toISOString(),
  };
}

/** Returns the challenge and registry-owned public key; never trusts a client key. */
export async function getDeviceHttpRequestChallengeForUser(
  uid: string,
  email: string,
  challengeId: string,
): Promise<StoredDeviceHttpRequestChallenge | null> {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(challengeId)) return null;
  const user = await getOrCreateUser(uid, email);
  const [row] = await db.select({
    challenge: deviceHttpRequestChallenges,
    device: deviceRegistrations,
  }).from(deviceHttpRequestChallenges)
    .innerJoin(deviceRegistrations, eq(deviceHttpRequestChallenges.deviceRegistrationId, deviceRegistrations.id))
    .where(and(
      eq(deviceHttpRequestChallenges.userId, user.id),
      eq(deviceHttpRequestChallenges.id, challengeId),
      isNull(deviceHttpRequestChallenges.consumedAt),
      gt(deviceHttpRequestChallenges.expiresAt, new Date()),
      eq(deviceRegistrations.userId, user.id),
      eq(deviceRegistrations.status, 'active'),
    )).limit(1);
  const publicKey = row?.device.signingPublicKey as unknown as StoredDeviceHttpRequestChallenge['signingPublicKey'] | null;
  if (!row || !publicKey || publicKey.kty !== 'EC' || publicKey.crv !== 'P-256' ||
      typeof publicKey.x !== 'string' || typeof publicKey.y !== 'string') return null;
  return {
    challengeId: row.challenge.id,
    nonce: row.challenge.nonce,
    ownerUid: uid,
    deviceId: row.device.deviceId,
    method: row.challenge.method as DeviceHttpRequestChallenge['method'],
    path: row.challenge.path,
    bodySha256: row.challenge.bodySha256,
    expiresAt: row.challenge.expiresAt.toISOString(),
    signingPublicKey: publicKey,
  };
}

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Consumes the verified challenge and executes the memory DB operation inside
 * the same transaction. The caller must verify the ECDSA proof first. A replay,
 * expired challenge, revoked device, or cross-owner request never reaches work.
 */
export async function withConsumedDeviceHttpRequestChallenge<T>(
  uid: string,
  email: string,
  challengeId: string,
  expectedSigningPublicKey: StoredDeviceHttpRequestChallenge['signingPublicKey'],
  operation: (tx: DatabaseTransaction) => Promise<T>,
): Promise<T | null> {
  const user = await getOrCreateUser(uid, email);
  return db.transaction(async (tx) => {
    const [row] = await tx.select({
      challenge: deviceHttpRequestChallenges,
      device: deviceRegistrations,
    }).from(deviceHttpRequestChallenges)
      .innerJoin(deviceRegistrations, eq(deviceHttpRequestChallenges.deviceRegistrationId, deviceRegistrations.id))
      .where(and(
        eq(deviceHttpRequestChallenges.userId, user.id),
        eq(deviceHttpRequestChallenges.id, challengeId),
        isNull(deviceHttpRequestChallenges.consumedAt),
        gt(deviceHttpRequestChallenges.expiresAt, new Date()),
        eq(deviceRegistrations.userId, user.id),
        eq(deviceRegistrations.status, 'active'),
      )).limit(1).for('update');
    const currentPublicKey = row?.device.signingPublicKey as unknown as StoredDeviceHttpRequestChallenge['signingPublicKey'] | null;
    if (!row || !currentPublicKey ||
        currentPublicKey.kty !== expectedSigningPublicKey.kty ||
        currentPublicKey.crv !== expectedSigningPublicKey.crv ||
        currentPublicKey.x !== expectedSigningPublicKey.x ||
        currentPublicKey.y !== expectedSigningPublicKey.y) return null;
    const consumed = await tx.update(deviceHttpRequestChallenges)
      .set({ consumedAt: new Date() })
      .where(and(
        eq(deviceHttpRequestChallenges.userId, user.id),
        eq(deviceHttpRequestChallenges.id, challengeId),
        isNull(deviceHttpRequestChallenges.consumedAt),
        gt(deviceHttpRequestChallenges.expiresAt, new Date()),
      )).returning({ id: deviceHttpRequestChallenges.id });
    if (!consumed.length) return null;
    return operation(tx);
  });
}
