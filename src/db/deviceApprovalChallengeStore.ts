import { and, eq, gt, isNull } from 'drizzle-orm';
import { randomBytes, randomUUID } from 'node:crypto';
import { db } from './index.ts';
import { deviceApprovalChallenges, deviceRegistrations } from './schema.ts';
import { getOrCreateUser } from './users.ts';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export type DeviceApprovalChallengeRecord = {
  challengeId: string;
  nonce: string;
  ownerUid: string;
  approverDeviceId: string;
  targetRegistrationId: string;
  expiresAt: string;
  approverSigningPublicKey?: { kty: 'EC'; crv: 'P-256'; x: string; y: string };
};

export async function createDeviceApprovalChallengeForUser(
  uid: string,
  email: string,
  approverDeviceId: string,
  targetRegistrationId: string,
): Promise<DeviceApprovalChallengeRecord> {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(approverDeviceId) ||
      !/^[A-Za-z0-9_-]{16,128}$/.test(targetRegistrationId)) {
    throw new Error('Device approval identifiers are invalid.');
  }
  const user = await getOrCreateUser(uid, email);
  const [approver] = await db.select().from(deviceRegistrations).where(and(
    eq(deviceRegistrations.userId, user.id),
    eq(deviceRegistrations.deviceId, approverDeviceId),
    eq(deviceRegistrations.status, 'active'),
  )).limit(1);
  const [target] = await db.select().from(deviceRegistrations).where(and(
    eq(deviceRegistrations.userId, user.id),
    eq(deviceRegistrations.id, targetRegistrationId),
    eq(deviceRegistrations.status, 'pending'),
  )).limit(1);
  if (!approver || !approver.signingPublicKey || !target || approver.id === target.id) {
    throw new Error('An active enrolled device and a pending target device are required.');
  }
  const now = Date.now();
  const expiresAt = new Date(now + CHALLENGE_TTL_MS);
  const id = randomUUID();
  const nonce = randomBytes(32).toString('base64url');
  await db.insert(deviceApprovalChallenges).values({
    id, userId: user.id, approverRegistrationId: approver.id,
    targetRegistrationId: target.id, nonce, expiresAt,
  });
  return {
    challengeId: id,
    nonce,
    ownerUid: uid,
    approverDeviceId,
    targetRegistrationId,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function getDeviceApprovalChallengeForUser(
  uid: string,
  email: string,
  challengeId: string,
): Promise<DeviceApprovalChallengeRecord | null> {
  const user = await getOrCreateUser(uid, email);
  const [row] = await db.select({
    challenge: deviceApprovalChallenges,
    approver: deviceRegistrations,
  }).from(deviceApprovalChallenges)
    .innerJoin(deviceRegistrations, eq(deviceApprovalChallenges.approverRegistrationId, deviceRegistrations.id))
    .where(and(
      eq(deviceApprovalChallenges.userId, user.id),
      eq(deviceApprovalChallenges.id, challengeId),
      isNull(deviceApprovalChallenges.consumedAt),
      gt(deviceApprovalChallenges.expiresAt, new Date()),
      eq(deviceRegistrations.userId, user.id),
      eq(deviceRegistrations.status, 'active'),
    )).limit(1);
  if (!row || !row.approver.signingPublicKey) return null;
  const [target] = await db.select().from(deviceRegistrations).where(and(
    eq(deviceRegistrations.userId, user.id),
    eq(deviceRegistrations.id, row.challenge.targetRegistrationId),
    eq(deviceRegistrations.status, 'pending'),
  )).limit(1);
  if (!target) return null;
  return {
    challengeId: row.challenge.id,
    nonce: row.challenge.nonce,
    ownerUid: uid,
    approverDeviceId: row.approver.deviceId,
    targetRegistrationId: target.id,
    expiresAt: row.challenge.expiresAt.toISOString(),
    approverSigningPublicKey: row.approver.signingPublicKey as { kty: 'EC'; crv: 'P-256'; x: string; y: string },
  };
}

/**
 * Called only after the route verifies the ECDSA proof against the active
 * approver's immutable public signing key. Challenge consumption and target
 * activation share one transaction; concurrent replay can succeed only once.
 */
export async function consumeDeviceApprovalChallengeAndApproveForUser(
  uid: string,
  email: string,
  challengeId: string,
): Promise<boolean> {
  const user = await getOrCreateUser(uid, email);
  return db.transaction(async (tx) => {
    const [challenge] = await tx.select().from(deviceApprovalChallenges).where(and(
      eq(deviceApprovalChallenges.userId, user.id),
      eq(deviceApprovalChallenges.id, challengeId),
      isNull(deviceApprovalChallenges.consumedAt),
      gt(deviceApprovalChallenges.expiresAt, new Date()),
    )).limit(1);
    if (!challenge) return false;
    const [approver] = await tx.select().from(deviceRegistrations).where(and(
      eq(deviceRegistrations.userId, user.id),
      eq(deviceRegistrations.id, challenge.approverRegistrationId),
      eq(deviceRegistrations.status, 'active'),
    )).limit(1).for('update');
    const [target] = await tx.select().from(deviceRegistrations).where(and(
      eq(deviceRegistrations.userId, user.id),
      eq(deviceRegistrations.id, challenge.targetRegistrationId),
      eq(deviceRegistrations.status, 'pending'),
    )).limit(1).for('update');
    if (!approver?.signingPublicKey || !target || approver.id === target.id) return false;
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
        eq(deviceRegistrations.id, target.id),
        eq(deviceRegistrations.status, 'pending'),
      )).returning({ id: deviceRegistrations.id });
    if (!activated.length) throw new Error('Device approval state changed; transaction rolled back.');
    return true;
  });
}
