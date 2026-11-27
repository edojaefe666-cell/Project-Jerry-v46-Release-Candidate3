import { desc, eq, and } from 'drizzle-orm';
import { db } from './index.ts';
import { storageObjects } from './schema.ts';
import { getOrCreateUser } from './users.ts';

export type StoredObjectMetadata = {
  id: string;
  objectKey: string;
  contentType: string;
  byteSize: number;
  createdAt: string;
};

function toMetadata(row: typeof storageObjects.$inferSelect): StoredObjectMetadata {
  return {
    id: row.id,
    objectKey: row.objectKey,
    contentType: row.contentType,
    byteSize: row.byteSize,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function recordStorageObjectForUser(
  uid: string,
  email: string,
  object: { id: string; objectKey: string; contentType: string; byteSize: number },
): Promise<StoredObjectMetadata> {
  if (!Number.isSafeInteger(object.byteSize) || object.byteSize < 1 || object.byteSize > 8 * 1024 * 1024) {
    throw new Error('Storage object size is invalid.');
  }
  const user = await getOrCreateUser(uid, email);
  const rows = await db.insert(storageObjects).values({
    id: object.id,
    userId: user.id,
    objectKey: object.objectKey,
    contentType: object.contentType,
    byteSize: object.byteSize,
  }).returning();
  if (!rows[0]) throw new Error('Storage metadata could not be saved.');
  return toMetadata(rows[0]);
}

export async function listStorageObjectsForUser(
  uid: string,
  email: string,
  limit = 50,
): Promise<StoredObjectMetadata[]> {
  const user = await getOrCreateUser(uid, email);
  const rows = await db.select().from(storageObjects)
    .where(eq(storageObjects.userId, user.id))
    .orderBy(desc(storageObjects.createdAt))
    .limit(Math.max(1, Math.min(100, Math.floor(limit))));
  return rows.map(toMetadata);
}

export async function getStorageObjectForUser(
  uid: string,
  email: string,
  objectKey: string,
): Promise<StoredObjectMetadata | null> {
  const user = await getOrCreateUser(uid, email);
  const rows = await db.select().from(storageObjects)
    .where(and(eq(storageObjects.userId, user.id), eq(storageObjects.objectKey, objectKey)))
    .limit(1);
  return rows[0] ? toMetadata(rows[0]) : null;
}
