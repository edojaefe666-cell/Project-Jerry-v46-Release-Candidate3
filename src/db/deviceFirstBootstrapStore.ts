import { and, eq, gt, isNull, count } from 'drizzle-orm';
import { randomBytes, randomUUID } from 'node:crypto';
import { db } from './index.ts';
import { deviceApprovalChallenges, deviceRegistrations, users } from './schema.ts';
import { getOrCreateUser } from './users.ts';
import type { DeviceApprovalChallengeRecord } from './deviceApprovalChallengeStore.ts';

const BOOTSTRAP_TTL_MS = 3 * 60 * 1000;

/**
 * First-device bootstrap is intentionally a separate transition from ordinary
 * device approval. It is allowed only while the owner has no active devices;
 * recent Firebase authentication and native confirmation are enforced by the
 * route and the one-time ECDSA proof is verified against this pending device.
 */
export async function createFirstDeviceBootstrapChallenge(
  uid: string,
  email: string,
  registrationId: string,
): Promise<DeviceApprovalChallengeRecord> {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(registrationId)) {
    throw new Error('First-device registration identifier is invalid.');
  }
  const user = await getOrCreateUser(uid, email);
  const [registration] = await db.select().from(deviceRegistrations).where(and(
    eq(deviceRegistrations.userId, user.id),
    eq(deviceRegistrations.id, registrationId),
    eq(deviceRegistrations.status, 'pending'),
  )).limit(1);
  if (!registration?.signingPublicKey) throw new Error('A pending device with a registered signing key is required.');
  const [active] = await db.select({ total: count() }).from(deviceRegistrations).where(and(
    eq(deviceRegistrations.userId, user.id),
    eq(deviceRegistrations.status, 'active'),
  ));
  if (Number(active?.total ?? 0) !== 0) throw new Error('First-device bootstrap is closed because an active owner device already exists.');

  const id = randomUUID();
  const nonce = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + BOOTSTRAP_TTL_MS);
  await db.insert(deviceApprovalChallenges).values({
    id,
    userId: user.id,
    approverRegistrationId: registration.id,
    targetRegistrationId: registration.id,
    nonce,
    expiresAt,
  });
  return {
    challengeId: id,
    nonce,
    ownerUid: uid,
    approverDeviceId: registration.deviceId,
    targetRegistrationId: registration.id,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function getFirstDeviceBootstrapChallenge(
  uid: string,
  email: string,
  challengeId: string,
): Promise<DeviceApprovalChallengeRecord | null> {
  const user = await getOrCreateUser(uid, email);
  const [row] = await db.select({
    challenge: deviceApprovalChallenges,
    device: deviceRegistrations,
  }).from(deviceApprovalChallenges)
    .innerJoin(deviceRegistrations, eq(deviceApprovalChallenges.approverRegistrationId, deviceRegistrations.id))
    .where(and(
      eq(deviceApprovalChallenges.userId, user.id),
      eq(deviceApprovalChallenges.id, challengeId),
      eq(deviceApprovalChallenges.targetRegistrationId, deviceApprovalChallenges.approverRegistrationId),
      isNull(deviceApprovalChallenges.consumedAt),
      gt(deviceApprovalChallenges.expiresAt, new Date()),
      eq(deviceRegistrations.userId, user.id),
      eq(deviceRegistrations.status, 'pending'),
    )).limit(1);
  if (!row || !row.device.signingPublicKey) return null;
  const [active] = await db.select({ total: count() }).from(deviceRegistrations).where(and(
    eq(deviceRegistrations.userId, user.id),
    eq(deviceRegistrations.status, 'active'),
  ));
  if (Number(active?.total ?? 0) !== 0) return null;
  return {
    challengeId: row.challenge.id,
    nonce: row.challenge.nonce,
    ownerUid: uid,
    approverDeviceId: row.device.deviceId,
    targetRegistrationId: row.device.id,
    expiresAt: row.challenge.expiresAt.toISOString(),
    approverSigningPublicKey: row.device.signingPublicKey as { kty: 'EC'; crv: 'P-256'; x: string; y: string },
  };
}

/** Locks the owner row to serialize competing first-device activations. */
export async function consumeFirstDeviceBootstrapChallenge(
  uid: string,
  email: string,
  challengeId: string,
): Promise<boolean> {
  const user = await getOrCreateUser(uid, email);
  return db.transaction(async (tx) => {
    const [owner] = await tx.select({ id: users.id }).from(users)
      .where(eq(users.id, user.id)).limit(1).for('update');
    if (!owner) return false;
    const [active] = await tx.select({ total: count() }).from(deviceRegistrations).where(and(
      eq(deviceRegistrations.userId, user.id),
      eq(deviceRegistrations.status, 'active'),
    ));
    if (Number(active?.total ?? 0) !== 0) return false;

    const [challenge] = await tx.select().from(deviceApprovalChallenges).where(and(
      eq(deviceApprovalChallenges.userId, user.id),
      eq(deviceApprovalChallenges.id, challengeId),
      eq(deviceApprovalChallenges.approverRegistrationId, deviceApprovalChallenges.targetRegistrationId),
      isNull(deviceApprovalChallenges.consumedAt),
      gt(deviceApprovalChallenges.expiresAt, new Date()),
    )).limit(1).for('update');
    if (!challenge) return false;
    const [device] = await tx.select().from(deviceRegistrations).where(and(
      eq(deviceRegistrations.userId, user.id),
      eq(deviceRegistrations.id, challenge.targetRegistrationId),
      eq(deviceRegistrations.id, challenge.approverRegistrationId),
      eq(deviceRegistrations.status, 'pending'),
    )).limit(1).for('update');
    if (!device?.signingPublicKey) return false;

    const consumed = await tx.update(deviceApprovalChallenges)
      .set({ consumedAt: new Date() })
      .where(and(
        eq(deviceApprovalChallenges.userId, user.id),
        eq(deviceApprovalChallenges.id, challengeId),
        isNull(deviceApprovalChallenges.consumedAt),
        gt(deviceApprovalChallenges.expiresAt, new Date()),
      )).returning({ id: deviceApprovalChallenges.id });
    if (!consumed.length) return false;
    const activated = await tx.update(deviceRegistrations)
      .set({ status: 'active', approvedAt: new Date(), revokedAt: null })
      .where(and(
        eq(deviceRegistrations.userId, user.id),
        eq(deviceRegistrations.id, device.id),
        eq(deviceRegistrations.status, 'pending'),
      )).returning({ id: deviceRegistrations.id });
    return activated.length === 1;
  });
}
