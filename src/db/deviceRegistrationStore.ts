import { and, asc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from './index.ts';
import { deviceRegistrations } from './schema.ts';
import { getOrCreateUser } from './users.ts';

export type DeviceExchangePublicKey = {
  kty: 'EC';
  crv: 'P-256';
  x: string;
  y: string;
  ext?: boolean;
  key_ops?: string[];
};

export type DeviceRegistrationStatus = 'pending' | 'active' | 'revoked';

export type DeviceRegistrationInput = {
  deviceId: string;
  deviceName: string;
  platform: 'android' | 'web' | 'ios' | 'other';
  exchangePublicKey: DeviceExchangePublicKey;
};

export type DeviceRegistrationRecord = {
  id: string;
  deviceId: string;
  deviceName: string;
  platform: string;
  exchangePublicKey: DeviceExchangePublicKey;
  status: DeviceRegistrationStatus;
  createdAt: string;
  approvedAt: string | null;
  revokedAt: string | null;
  lastSeenAt: string | null;
};

function validateInput(input: DeviceRegistrationInput): void {
  if (!input || typeof input.deviceId !== 'string' ||
      !/^[A-Za-z0-9_-]{16,128}$/.test(input.deviceId)) {
    throw new Error('Device identifier is invalid.');
  }
  if (typeof input.deviceName !== 'string' || !input.deviceName.trim() ||
      input.deviceName.trim().length > 80) {
    throw new Error('Device name must contain 1–80 characters.');
  }
  if (!['android', 'web', 'ios', 'other'].includes(input.platform)) {
    throw new Error('Device platform is invalid.');
  }
  const key = input.exchangePublicKey;
  if (!key || key.kty !== 'EC' || key.crv !== 'P-256' ||
      typeof key.x !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(key.x) ||
      typeof key.y !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(key.y) ||
      'd' in (key as unknown as Record<string, unknown>)) {
    throw new Error('Only a valid P-256 public exchange key may be registered.');
  }
}

function toRecord(row: typeof deviceRegistrations.$inferSelect): DeviceRegistrationRecord {
  return {
    id: row.id,
    deviceId: row.deviceId,
    deviceName: row.deviceName,
    platform: row.platform,
    exchangePublicKey: row.exchangePublicKey as DeviceExchangePublicKey,
    status: row.status as DeviceRegistrationStatus,
    createdAt: row.createdAt.toISOString(),
    approvedAt: row.approvedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
  };
}

/**
 * Stores only a public exchange key. New registrations always begin pending;
 * callers must not treat a successful insert as device authorization.
 */
export async function requestDeviceRegistrationForUser(
  uid: string,
  email: string,
  input: DeviceRegistrationInput,
): Promise<DeviceRegistrationRecord> {
  validateInput(input);
  const user = await getOrCreateUser(uid, email);
  const rows = await db.insert(deviceRegistrations).values({
    id: randomUUID(),
    userId: user.id,
    deviceId: input.deviceId,
    deviceName: input.deviceName.trim(),
    platform: input.platform,
    exchangePublicKey: input.exchangePublicKey,
    status: 'pending',
  }).returning();
  if (!rows[0]) throw new Error('Device registration could not be created.');
  return toRecord(rows[0]);
}

export async function listDeviceRegistrationsForUser(
  uid: string,
  email: string,
): Promise<DeviceRegistrationRecord[]> {
  const user = await getOrCreateUser(uid, email);
  const rows = await db.select().from(deviceRegistrations)
    .where(eq(deviceRegistrations.userId, user.id))
    .orderBy(asc(deviceRegistrations.createdAt));
  return rows.map(toRecord);
}

/** Internal transition only. An authenticated route must add existing-device proof before calling. */
export async function approveDeviceRegistrationForUser(
  uid: string,
  email: string,
  registrationId: string,
): Promise<DeviceRegistrationRecord | null> {
  const user = await getOrCreateUser(uid, email);
  const rows = await db.update(deviceRegistrations)
    .set({ status: 'active', approvedAt: new Date(), revokedAt: null })
    .where(and(
      eq(deviceRegistrations.userId, user.id),
      eq(deviceRegistrations.id, registrationId),
      eq(deviceRegistrations.status, 'pending'),
    ))
    .returning();
  return rows[0] ? toRecord(rows[0]) : null;
}

export async function revokeDeviceRegistrationForUser(
  uid: string,
  email: string,
  registrationId: string,
): Promise<DeviceRegistrationRecord | null> {
  const user = await getOrCreateUser(uid, email);
  const rows = await db.update(deviceRegistrations)
    .set({ status: 'revoked', revokedAt: new Date() })
    .where(and(
      eq(deviceRegistrations.userId, user.id),
      eq(deviceRegistrations.id, registrationId),
      eq(deviceRegistrations.status, 'active'),
    ))
    .returning();
  return rows[0] ? toRecord(rows[0]) : null;
}
