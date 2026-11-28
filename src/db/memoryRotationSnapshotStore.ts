import { createHash, randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { db } from './index.ts';
import { encryptedMemoryRecords, memoryRotationSnapshots, memoryRotationSnapshotRecords } from './schema.ts';
import { getOrCreateUser } from './users.ts';

export interface MemoryRotationSnapshot {
  snapshotId: string;
  rotationId: string;
  fromKeyVersion: number;
  totalRecords: number;
  manifestSha256: string;
  createdAt: string;
}
export interface MemoryRotationSnapshotPage {
  snapshot: MemoryRotationSnapshot;
  entries: Array<{ ordinal: number; recordId: string; keyVersion: number; revision: number; createdAt: string }>;
  nextOffset: number | null;
}

/** Captures an immutable, owner-scoped manifest of record IDs and expected revisions. */
export async function createMemoryRotationSnapshotForUser(
  uid: string, email: string, rotationId: string, fromKeyVersion: number,
): Promise<MemoryRotationSnapshot> {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(rotationId) ||
      !Number.isSafeInteger(fromKeyVersion) || fromKeyVersion < 1) {
    throw new Error('Memory rotation snapshot request is invalid.');
  }
  const user = await getOrCreateUser(uid, email);
  return db.transaction(async (tx) => {
    const existing = await tx.select().from(memoryRotationSnapshots).where(and(
      eq(memoryRotationSnapshots.userId, user.id),
      eq(memoryRotationSnapshots.rotationId, rotationId),
    )).limit(1);
    if (existing[0]) {
      const row = existing[0];
      if (row.fromKeyVersion !== fromKeyVersion) throw new Error('Rotation ID is already bound to another source key version.');
      return { snapshotId: row.id, rotationId: row.rotationId, fromKeyVersion: row.fromKeyVersion,
        totalRecords: row.totalRecords, manifestSha256: row.manifestSha256, createdAt: row.createdAt.toISOString() };
    }
    const rows = await tx.select({
      recordId: encryptedMemoryRecords.id,
      keyVersion: encryptedMemoryRecords.keyVersion,
      revision: encryptedMemoryRecords.revision,
      createdAt: encryptedMemoryRecords.createdAt,
    }).from(encryptedMemoryRecords).where(eq(encryptedMemoryRecords.userId, user.id))
      .orderBy(asc(encryptedMemoryRecords.createdAt), asc(encryptedMemoryRecords.id));
    if (rows.length > 100_000) throw new Error('Encrypted memory set exceeds the supported rotation manifest limit.');
    if (rows.some(row => row.keyVersion !== fromKeyVersion)) {
      throw new Error('Encrypted memory contains records outside the requested source key version; rotation must be reconciled first.');
    }
    const canonical = JSON.stringify(rows.map((row, ordinal) => ({
      ordinal, recordId: row.recordId, keyVersion: row.keyVersion,
      revision: row.revision, createdAt: row.createdAt.toISOString(),
    })));
    const manifestSha256 = createHash('sha256').update(canonical, 'utf8').digest('base64url');
    const snapshotId = randomUUID();
    const [header] = await tx.insert(memoryRotationSnapshots).values({
      id: snapshotId, userId: user.id, rotationId, fromKeyVersion,
      totalRecords: rows.length, manifestSha256,
    }).returning();
    if (!header) throw new Error('Memory rotation snapshot could not be created.');
    for (let offset = 0; offset < rows.length; offset += 500) {
      const chunk = rows.slice(offset, offset + 500);
      if (chunk.length) await tx.insert(memoryRotationSnapshotRecords).values(chunk.map((row, index) => ({
        id: randomUUID(), snapshotId, userId: user.id, ordinal: offset + index,
        recordId: row.recordId, keyVersion: row.keyVersion, revision: row.revision, createdAt: row.createdAt,
      })));
    }
    return { snapshotId: header.id, rotationId: header.rotationId, fromKeyVersion: header.fromKeyVersion,
      totalRecords: header.totalRecords, manifestSha256: header.manifestSha256, createdAt: header.createdAt.toISOString() };
  }, { isolationLevel: 'repeatable read' });
}

/** Reads immutable manifest pages for the authenticated owner; live records cannot reorder the manifest. */
export async function getMemoryRotationSnapshotPageForUser(
  uid: string, email: string, rotationId: string, offset = 0, limit = 100,
): Promise<MemoryRotationSnapshotPage | null> {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(rotationId) ||
      !Number.isSafeInteger(offset) || offset < 0 ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
    throw new Error('Memory rotation snapshot page request is invalid.');
  }
  const user = await getOrCreateUser(uid, email);
  const [header] = await db.select().from(memoryRotationSnapshots).where(and(
    eq(memoryRotationSnapshots.userId, user.id),
    eq(memoryRotationSnapshots.rotationId, rotationId),
  )).limit(1);
  if (!header) return null;
  const rows = await db.select().from(memoryRotationSnapshotRecords).where(and(
    eq(memoryRotationSnapshotRecords.userId, user.id),
    eq(memoryRotationSnapshotRecords.snapshotId, header.id),
  )).orderBy(asc(memoryRotationSnapshotRecords.ordinal)).limit(limit + 1).offset(offset);
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    snapshot: { snapshotId: header.id, rotationId: header.rotationId, fromKeyVersion: header.fromKeyVersion,
      totalRecords: header.totalRecords, manifestSha256: header.manifestSha256, createdAt: header.createdAt.toISOString() },
    entries: page.map(row => ({ ordinal: row.ordinal, recordId: row.recordId, keyVersion: row.keyVersion,
      revision: row.revision, createdAt: row.createdAt.toISOString() })),
    nextOffset: hasMore ? offset + page.length : null,
  };
}

/** Recomputes the immutable manifest digest and record count before rotation proceeds. */
export async function verifyMemoryRotationSnapshotForUser(
  uid: string, email: string, rotationId: string,
): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(rotationId)) return false;
  const user = await getOrCreateUser(uid, email);
  const [header] = await db.select().from(memoryRotationSnapshots).where(and(
    eq(memoryRotationSnapshots.userId, user.id),
    eq(memoryRotationSnapshots.rotationId, rotationId),
  )).limit(1);
  if (!header) return false;
  const rows = await db.select().from(memoryRotationSnapshotRecords).where(and(
    eq(memoryRotationSnapshotRecords.userId, user.id),
    eq(memoryRotationSnapshotRecords.snapshotId, header.id),
  )).orderBy(asc(memoryRotationSnapshotRecords.ordinal));
  if (rows.length !== header.totalRecords) return false;
  const canonical = JSON.stringify(rows.map(row => ({
    ordinal: row.ordinal, recordId: row.recordId, keyVersion: row.keyVersion,
    revision: row.revision, createdAt: row.createdAt.toISOString(),
  })));
  return createHash('sha256').update(canonical, 'utf8').digest('base64url') === header.manifestSha256;
}
