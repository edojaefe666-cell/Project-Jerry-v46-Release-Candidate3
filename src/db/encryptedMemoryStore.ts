import { and, desc, eq } from 'drizzle-orm';
import { db } from './index.ts';
import { encryptedMemoryRecords } from './schema.ts';
import { getOrCreateUser } from './users.ts';
import type { EncryptedMemoryRecord } from '../lib/encryptedMemoryRecord.ts';

export interface StoredEncryptedMemoryRecord extends EncryptedMemoryRecord {
  createdAt: string;
  updatedAt: string;
}

export function validateEncryptedMemoryRecord(record: unknown): string | null {
  if (!record || typeof record !== 'object') return 'An encrypted memory record is required.';
  const value = record as Record<string, unknown>;
  const allowedFields = new Set(['schemaVersion', 'recordId', 'keyVersion', 'revision', 'iv', 'ciphertext']);
  if (Object.keys(value).some((field) => !allowedFields.has(field))) {
    return 'Encrypted memory record must contain ciphertext envelope fields only.';
  }
  if (value.schemaVersion !== 1 ||
      typeof value.recordId !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(value.recordId) ||
      !Number.isSafeInteger(value.keyVersion) || (value.keyVersion as number) < 1 ||
      !Number.isSafeInteger(value.revision) || (value.revision as number) < 1 ||
      typeof value.iv !== 'string' || !/^[A-Za-z0-9_-]{16}$/.test(value.iv) ||
      typeof value.ciphertext !== 'string' || value.ciphertext.length < 23 ||
      value.ciphertext.length > 64_000 || value.ciphertext.length % 4 === 1 || !/^[A-Za-z0-9_-]+$/.test(value.ciphertext)) {
    return 'Encrypted memory record envelope is invalid.';
  }
  return null;
}

function toStoredRecord(row: typeof encryptedMemoryRecords.$inferSelect): StoredEncryptedMemoryRecord {
  return {
    schemaVersion: 1,
    recordId: row.id,
    keyVersion: row.keyVersion,
    revision: row.revision,
    iv: row.iv,
    ciphertext: row.ciphertext,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Inserts only an opaque ID, crypto version/revision, IV, and ciphertext. */
export async function createEncryptedMemoryRecordForUser(
  uid: string,
  email: string,
  record: EncryptedMemoryRecord,
): Promise<StoredEncryptedMemoryRecord> {
  const validationError = validateEncryptedMemoryRecord(record);
  if (validationError) throw new Error(validationError);
  if (record.revision !== 1) throw new Error('A new encrypted memory record must start at revision 1.');
  const user = await getOrCreateUser(uid, email);
  const rows = await db.insert(encryptedMemoryRecords).values({
    id: record.recordId,
    userId: user.id,
    keyVersion: record.keyVersion,
    revision: record.revision,
    iv: record.iv,
    ciphertext: record.ciphertext,
  }).returning();
  if (!rows[0]) throw new Error('Encrypted memory record could not be created.');
  return toStoredRecord(rows[0]);
}

/**
 * Compare-and-swap update. Stale revisions fail rather than overwriting another
 * device's update. AAD binds the new ciphertext to expectedRevision + 1.
 */
export async function updateEncryptedMemoryRecordForUser(
  uid: string,
  email: string,
  record: EncryptedMemoryRecord,
  expectedRevision: number,
): Promise<StoredEncryptedMemoryRecord | null> {
  const validationError = validateEncryptedMemoryRecord(record);
  if (validationError) throw new Error(validationError);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1 ||
      record.revision !== expectedRevision + 1) {
    throw new Error('Encrypted memory revision transition is invalid.');
  }
  const user = await getOrCreateUser(uid, email);
  const rows = await db.update(encryptedMemoryRecords).set({
    keyVersion: record.keyVersion,
    revision: record.revision,
    iv: record.iv,
    ciphertext: record.ciphertext,
    updatedAt: new Date(),
  }).where(and(
    eq(encryptedMemoryRecords.userId, user.id),
    eq(encryptedMemoryRecords.id, record.recordId),
    eq(encryptedMemoryRecords.revision, expectedRevision),
  )).returning();
  return rows[0] ? toStoredRecord(rows[0]) : null;
}

/** Returns ciphertext only; no plaintext search/filtering exists on the server. */
export async function listEncryptedMemoryRecordsForUser(
  uid: string,
  email: string,
  limit = 100,
): Promise<StoredEncryptedMemoryRecord[]> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
    throw new Error('Encrypted memory page size must be between 1 and 500.');
  }
  const user = await getOrCreateUser(uid, email);
  const rows = await db.select().from(encryptedMemoryRecords)
    .where(eq(encryptedMemoryRecords.userId, user.id))
    .orderBy(desc(encryptedMemoryRecords.updatedAt), desc(encryptedMemoryRecords.id))
    .limit(limit);
  return rows.map(toStoredRecord);
}
