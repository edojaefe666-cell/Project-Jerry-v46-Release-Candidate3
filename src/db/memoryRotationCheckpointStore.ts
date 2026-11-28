import { and, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from './index.ts';
import { memoryRotationCheckpoints } from './schema.ts';
import { getOrCreateUser } from './users.ts';
import {
  validateMemoryRotationCheckpoint,
  type MemoryRotationCheckpoint,
} from '../lib/memoryRotation.ts';

export interface StoredMemoryRotationCheckpoint {
  id: string;
  checkpointRevision: number;
  checkpoint: MemoryRotationCheckpoint;
  createdAt: string;
  updatedAt: string;
}

function toStored(row: typeof memoryRotationCheckpoints.$inferSelect): StoredMemoryRotationCheckpoint {
  if (!validateMemoryRotationCheckpoint(row.checkpointJson)) {
    throw new Error('Stored memory rotation checkpoint failed integrity validation.');
  }
  if (row.rotationId !== row.checkpointJson.rotationId ||
      row.fromKeyVersion !== row.checkpointJson.fromKeyVersion ||
      row.toKeyVersion !== row.checkpointJson.toKeyVersion ||
      row.phase !== row.checkpointJson.phase) {
    throw new Error('Stored memory rotation checkpoint metadata does not match its payload.');
  }
  return {
    id: row.id,
    checkpointRevision: row.checkpointRevision,
    checkpoint: row.checkpointJson,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Creates a durable owner-scoped checkpoint. No record ciphertext or key material is stored here. */
export async function createMemoryRotationCheckpointForUser(
  uid: string,
  email: string,
  checkpoint: MemoryRotationCheckpoint,
): Promise<StoredMemoryRotationCheckpoint> {
  if (!validateMemoryRotationCheckpoint(checkpoint)) {
    throw new Error('A valid memory rotation checkpoint is required.');
  }
  const user = await getOrCreateUser(uid, email);
  const [row] = await db.insert(memoryRotationCheckpoints).values({
    id: randomUUID(),
    userId: user.id,
    rotationId: checkpoint.rotationId,
    fromKeyVersion: checkpoint.fromKeyVersion,
    toKeyVersion: checkpoint.toKeyVersion,
    checkpointRevision: 1,
    phase: checkpoint.phase,
    checkpointJson: checkpoint,
  }).returning();
  if (!row) throw new Error('Memory rotation checkpoint was not created.');
  return toStored(row);
}

/** Owner-scoped read. Corrupt or mismatched JSON is rejected, never silently repaired. */
export async function getMemoryRotationCheckpointForUser(
  uid: string,
  email: string,
  rotationId: string,
): Promise<StoredMemoryRotationCheckpoint | null> {
  if (typeof rotationId !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(rotationId)) return null;
  const user = await getOrCreateUser(uid, email);
  const [row] = await db.select().from(memoryRotationCheckpoints).where(and(
    eq(memoryRotationCheckpoints.userId, user.id),
    eq(memoryRotationCheckpoints.rotationId, rotationId),
  )).limit(1);
  return row ? toStored(row) : null;
}

/** Compare-and-swap checkpoint update; stale writers cannot erase newer progress. */
export async function updateMemoryRotationCheckpointForUser(
  uid: string,
  email: string,
  rotationId: string,
  expectedCheckpointRevision: number,
  checkpoint: MemoryRotationCheckpoint,
): Promise<StoredMemoryRotationCheckpoint | null> {
  if (!Number.isSafeInteger(expectedCheckpointRevision) || expectedCheckpointRevision < 1 ||
      !validateMemoryRotationCheckpoint(checkpoint) || checkpoint.rotationId !== rotationId) {
    throw new Error('Memory rotation checkpoint update is invalid.');
  }
  const user = await getOrCreateUser(uid, email);
  const [row] = await db.update(memoryRotationCheckpoints).set({
    phase: checkpoint.phase,
    checkpointJson: checkpoint,
    checkpointRevision: expectedCheckpointRevision + 1,
    updatedAt: new Date(),
  }).where(and(
    eq(memoryRotationCheckpoints.userId, user.id),
    eq(memoryRotationCheckpoints.rotationId, rotationId),
    eq(memoryRotationCheckpoints.checkpointRevision, expectedCheckpointRevision),
    eq(memoryRotationCheckpoints.fromKeyVersion, checkpoint.fromKeyVersion),
    eq(memoryRotationCheckpoints.toKeyVersion, checkpoint.toKeyVersion),
  )).returning();
  return row ? toStored(row) : null;
}

/** Lists only the current owner's metadata, newest first. */
export async function listMemoryRotationCheckpointsForUser(
  uid: string,
  email: string,
  limit = 20,
): Promise<StoredMemoryRotationCheckpoint[]> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('Memory rotation checkpoint page size must be between 1 and 100.');
  }
  const user = await getOrCreateUser(uid, email);
  const rows = await db.select().from(memoryRotationCheckpoints)
    .where(eq(memoryRotationCheckpoints.userId, user.id))
    .orderBy(desc(memoryRotationCheckpoints.updatedAt), desc(memoryRotationCheckpoints.id))
    .limit(limit);
  return rows.map(toStored);
}
