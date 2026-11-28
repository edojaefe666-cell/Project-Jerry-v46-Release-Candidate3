import { createHash, randomUUID } from 'node:crypto';
import { and, asc, eq, gt } from 'drizzle-orm';
import { db } from './index.ts';
import { encryptedMemoryRecords, memoryRotationSnapshots, memoryRotationSnapshotItems } from './schema.ts';
import { getOrCreateUser } from './users.ts';

const ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const MAX_SNAPSHOT_RECORDS = 100_000;

export interface MemoryRotationSnapshotItem {
  recordId: string; keyVersion: number; revision: number; createdAt: string;
}
export interface StoredMemoryRotationSnapshot {
  id: string; rotationId: string; fromKeyVersion: number;
  totalRecords: number; manifestHash: string; createdAt: string;
}
export interface MemoryRotationSnapshotPage {
  snapshot: StoredMemoryRotationSnapshot; items: MemoryRotationSnapshotItem[];
  nextAfterRecordId: string | null; complete: boolean;
}
function manifestDigest(items: MemoryRotationSnapshotItem[]): string {
  const canonical = items.map(item => [item.recordId, item.keyVersion, item.revision, item.createdAt]);
  return createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('base64url');
}

/** Captures the full identity/version/revision set under one PostgreSQL MVCC snapshot. */
export async function createMemoryRotationSnapshotForUser(
  uid: string, email: string, rotationId: string, fromKeyVersion: number,
): Promise<StoredMemoryRotationSnapshot> {
  if (!ID_PATTERN.test(rotationId) || !Number.isSafeInteger(fromKeyVersion) || fromKeyVersion < 1)
    throw new Error('Memory rotation snapshot request is invalid.');
  const user = await getOrCreateUser(uid, email);
  return db.transaction(async tx => {
    const existing = await tx.select().from(memoryRotationSnapshots).where(and(
      eq(memoryRotationSnapshots.userId, user.id), eq(memoryRotationSnapshots.rotationId, rotationId),
    )).limit(1);
    if (existing[0]) {
      const row = existing[0];
      if (row.fromKeyVersion !== fromKeyVersion) throw new Error('Rotation snapshot already exists for a different source key version.');
      return { id: row.id, rotationId: row.rotationId, fromKeyVersion: row.fromKeyVersion,
        totalRecords: row.totalRecords, manifestHash: row.manifestHash, createdAt: row.createdAt.toISOString() };
    }
    const records = await tx.select({
      recordId: encryptedMemoryRecords.id, keyVersion: encryptedMemoryRecords.keyVersion,
      revision: encryptedMemoryRecords.revision, createdAt: encryptedMemoryRecords.createdAt,
    }).from(encryptedMemoryRecords).where(eq(encryptedMemoryRecords.userId, user.id))
      .orderBy(asc(encryptedMemoryRecords.id));
    if (records.length > MAX_SNAPSHOT_RECORDS) throw new Error('Encrypted memory snapshot exceeds the current safe manifest limit.');
    const items = records.map(row => ({ recordId: row.recordId, keyVersion: row.keyVersion,
      revision: row.revision, createdAt: row.createdAt.toISOString() }));
    const id = randomUUID(), manifestHash = manifestDigest(items);
    const [snapshot] = await tx.insert(memoryRotationSnapshots).values({
      id, userId: user.id, rotationId, fromKeyVersion, totalRecords: items.length, manifestHash,
    }).returning();
    if (!snapshot) throw new Error('Memory rotation snapshot could not be persisted.');
    for (let offset = 0; offset < records.length; offset += 500) {
      const chunk = records.slice(offset, offset + 500);
      if (chunk.length) await tx.insert(memoryRotationSnapshotItems).values(chunk.map(row => ({
        snapshotId: id, userId: user.id, recordId: row.recordId, keyVersion: row.keyVersion,
        revision: row.revision, recordCreatedAt: row.createdAt,
      })));
    }
    return { id: snapshot.id, rotationId: snapshot.rotationId, fromKeyVersion: snapshot.fromKeyVersion,
      totalRecords: snapshot.totalRecords, manifestHash: snapshot.manifestHash, createdAt: snapshot.createdAt.toISOString() };
  }, { isolationLevel: 'repeatable read' });
}

/** Owner-scoped, immutable keyset pagination over a persisted snapshot manifest. */
export async function getMemoryRotationSnapshotPageForUser(
  uid: string, email: string, snapshotId: string, afterRecordId?: string, limit = 100,
): Promise<MemoryRotationSnapshotPage | null> {
  if (!/^[0-9a-f-]{36}$/i.test(snapshotId) ||
      (afterRecordId !== undefined && !ID_PATTERN.test(afterRecordId)) ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 500)
    throw new Error('Memory rotation snapshot page request is invalid.');
  const user = await getOrCreateUser(uid, email);
  const [row] = await db.select().from(memoryRotationSnapshots).where(and(
    eq(memoryRotationSnapshots.userId, user.id), eq(memoryRotationSnapshots.id, snapshotId),
  )).limit(1);
  if (!row) return null;
  const where = afterRecordId
    ? and(eq(memoryRotationSnapshotItems.userId, user.id), eq(memoryRotationSnapshotItems.snapshotId, snapshotId),
        gt(memoryRotationSnapshotItems.recordId, afterRecordId))
    : and(eq(memoryRotationSnapshotItems.userId, user.id), eq(memoryRotationSnapshotItems.snapshotId, snapshotId));
  const rows = await db.select().from(memoryRotationSnapshotItems).where(where)
    .orderBy(asc(memoryRotationSnapshotItems.recordId)).limit(limit + 1);
  const hasMore = rows.length > limit, page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  return {
    snapshot: { id: row.id, rotationId: row.rotationId, fromKeyVersion: row.fromKeyVersion,
      totalRecords: row.totalRecords, manifestHash: row.manifestHash, createdAt: row.createdAt.toISOString() },
    items: page.map(item => ({ recordId: item.recordId, keyVersion: item.keyVersion,
      revision: item.revision, createdAt: item.recordCreatedAt.toISOString() })),
    nextAfterRecordId: hasMore && last ? last.recordId : null, complete: !hasMore,
  };
}

/** Recomputes count and digest; detects missing or altered manifest entries. */
export async function verifyMemoryRotationSnapshotForUser(uid: string, email: string, snapshotId: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(snapshotId)) return false;
  const user = await getOrCreateUser(uid, email);
  const [snapshot] = await db.select().from(memoryRotationSnapshots).where(and(
    eq(memoryRotationSnapshots.userId, user.id), eq(memoryRotationSnapshots.id, snapshotId),
  )).limit(1);
  if (!snapshot) return false;
  const rows = await db.select().from(memoryRotationSnapshotItems).where(and(
    eq(memoryRotationSnapshotItems.userId, user.id), eq(memoryRotationSnapshotItems.snapshotId, snapshotId),
  )).orderBy(asc(memoryRotationSnapshotItems.recordId));
  if (rows.length !== snapshot.totalRecords) return false;
  const items = rows.map(row => ({ recordId: row.recordId, keyVersion: row.keyVersion,
    revision: row.revision, createdAt: row.recordCreatedAt.toISOString() }));
  return manifestDigest(items) === snapshot.manifestHash;
}
