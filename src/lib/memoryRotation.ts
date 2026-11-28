/**
 * Serializable, secret-free checkpoint state for an owner-authorized memory-key
 * rotation. This module coordinates progress only; it never persists records,
 * handles key bytes, changes active keys, or authorizes external writes.
 */
export type MemoryRotationPhase =
  | 'prepared' | 'applying' | 'verifying' | 'ready_for_owner_approval'
  | 'paused' | 'aborted';

export interface MemoryRotationCheckpoint {
  schemaVersion: 1;
  rotationId: string;
  ownerUid: string;
  fromKeyVersion: number;
  toKeyVersion: number;
  phase: MemoryRotationPhase;
  recordIds: string[];
  writtenRecordIds: string[];
  verifiedRecordIds: string[];
  createdAt: string;
  updatedAt: string;
}

const ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

function validIso(value: string): boolean {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString() === value;
}

export function validateMemoryRotationCheckpoint(value: unknown): value is MemoryRotationCheckpoint {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  const allowed = new Set(['schemaVersion','rotationId','ownerUid','fromKeyVersion','toKeyVersion','phase','recordIds','writtenRecordIds','verifiedRecordIds','createdAt','updatedAt']);
  if (Object.keys(v).some(key => !allowed.has(key))) return false;
  if (v.schemaVersion !== 1 ||
      typeof v.rotationId !== 'string' || !ID_PATTERN.test(v.rotationId) ||
      typeof v.ownerUid !== 'string' || !v.ownerUid.trim() || v.ownerUid.length > 160 ||
      !Number.isSafeInteger(v.fromKeyVersion) || (v.fromKeyVersion as number) < 1 ||
      !Number.isSafeInteger(v.toKeyVersion) || v.toKeyVersion !== (v.fromKeyVersion as number) + 1 ||
      !['prepared','applying','verifying','ready_for_owner_approval','paused','aborted'].includes(String(v.phase)) ||
      !Array.isArray(v.recordIds) || !Array.isArray(v.writtenRecordIds) ||
      !Array.isArray(v.verifiedRecordIds) || (v.recordIds as unknown[]).length < 1 || (v.recordIds as unknown[]).length > 500 ||
      !v.recordIds.every(id => typeof id === 'string' && ID_PATTERN.test(id)) ||
      !v.writtenRecordIds.every(id => typeof id === 'string' && ID_PATTERN.test(id)) ||
      !v.verifiedRecordIds.every(id => typeof id === 'string' && ID_PATTERN.test(id)) ||
      !validIso(v.createdAt as string) || !validIso(v.updatedAt as string)) return false;
  const records = v.recordIds as string[];
  const written = v.writtenRecordIds as string[];
  const verified = v.verifiedRecordIds as string[];
  return new Set(records).size === records.length &&
    new Set(written).size === written.length &&
    new Set(verified).size === verified.length &&
    written.every(id => records.includes(id)) &&
    verified.every(id => written.includes(id));
}

function assertCheckpoint(value: unknown): asserts value is MemoryRotationCheckpoint {
  if (!validateMemoryRotationCheckpoint(value)) throw new Error('Memory rotation checkpoint is invalid.');
}

function update(
  checkpoint: MemoryRotationCheckpoint,
  patch: Partial<MemoryRotationCheckpoint>,
  now: Date,
): MemoryRotationCheckpoint {
  assertCheckpoint(checkpoint);
  if (!Number.isFinite(now.getTime())) throw new Error('Rotation checkpoint time is invalid.');
  const next = { ...checkpoint, ...patch, updatedAt: now.toISOString() };
  assertCheckpoint(next);
  return next;
}

/** Creates a secret-free checkpoint from the complete, deterministic record manifest. */
export function createMemoryRotationCheckpoint(input: {
  rotationId: string;
  ownerUid: string;
  fromKeyVersion: number;
  recordIds: string[];
  now?: Date;
}): MemoryRotationCheckpoint {
  const now = input.now ?? new Date();
  const checkpoint: MemoryRotationCheckpoint = {
    schemaVersion: 1,
    rotationId: input.rotationId,
    ownerUid: input.ownerUid,
    fromKeyVersion: input.fromKeyVersion,
    toKeyVersion: input.fromKeyVersion + 1,
    phase: 'prepared',
    recordIds: [...input.recordIds].sort(),
    writtenRecordIds: [],
    verifiedRecordIds: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  assertCheckpoint(checkpoint);
  return checkpoint;
}

export function markMemoryRotationRecordWritten(
  checkpoint: MemoryRotationCheckpoint,
  recordId: string,
  now = new Date(),
): MemoryRotationCheckpoint {
  assertCheckpoint(checkpoint);
  if (checkpoint.phase === 'paused' || checkpoint.phase === 'aborted' ||
      checkpoint.phase === 'ready_for_owner_approval' ||
      !checkpoint.recordIds.includes(recordId)) {
    throw new Error('Rotation cannot accept this record write.');
  }
  const written = checkpoint.writtenRecordIds.includes(recordId)
    ? checkpoint.writtenRecordIds
    : [...checkpoint.writtenRecordIds, recordId];
  const phase = written.length === checkpoint.recordIds.length ? 'verifying' : 'applying';
  return update(checkpoint, { writtenRecordIds: written, phase }, now);
}

export function markMemoryRotationRecordVerified(
  checkpoint: MemoryRotationCheckpoint,
  recordId: string,
  now = new Date(),
): MemoryRotationCheckpoint {
  assertCheckpoint(checkpoint);
  if (checkpoint.phase !== 'verifying' ||
      !checkpoint.writtenRecordIds.includes(recordId)) {
    throw new Error('Only a written rotation record can be verified.');
  }
  const verified = checkpoint.verifiedRecordIds.includes(recordId)
    ? checkpoint.verifiedRecordIds
    : [...checkpoint.verifiedRecordIds, recordId];
  const phase = verified.length === checkpoint.recordIds.length
    ? 'ready_for_owner_approval' : 'verifying';
  return update(checkpoint, { verifiedRecordIds: verified, phase }, now);
}

export function pauseMemoryRotation(
  checkpoint: MemoryRotationCheckpoint,
  now = new Date(),
): MemoryRotationCheckpoint {
  assertCheckpoint(checkpoint);
  if (checkpoint.phase === 'ready_for_owner_approval' || checkpoint.phase === 'aborted') {
    throw new Error('This rotation cannot be paused in its current phase.');
  }
  return update(checkpoint, { phase: 'paused' }, now);
}

export function resumeMemoryRotation(
  checkpoint: MemoryRotationCheckpoint,
  now = new Date(),
): MemoryRotationCheckpoint {
  assertCheckpoint(checkpoint);
  if (checkpoint.phase !== 'paused') throw new Error('Only a paused rotation can be resumed.');
  const phase = checkpoint.verifiedRecordIds.length === checkpoint.recordIds.length
    ? 'ready_for_owner_approval'
    : checkpoint.writtenRecordIds.length === checkpoint.recordIds.length
      ? 'verifying'
      : checkpoint.writtenRecordIds.length > 0 ? 'applying' : 'prepared';
  return update(checkpoint, { phase }, now);
}

export function abortMemoryRotation(
  checkpoint: MemoryRotationCheckpoint,
  now = new Date(),
): MemoryRotationCheckpoint {
  assertCheckpoint(checkpoint);
  if (checkpoint.phase === 'ready_for_owner_approval') {
    throw new Error('A fully verified rotation requires an explicit owner decision, not implicit abort.');
  }
  return update(checkpoint, { phase: 'aborted' }, now);
}

/** True only when every manifest record has a recorded write and verification. */
export function isMemoryRotationReadyForOwnerApproval(
  checkpoint: MemoryRotationCheckpoint,
): boolean {
  assertCheckpoint(checkpoint);
  return checkpoint.phase === 'ready_for_owner_approval' &&
    checkpoint.writtenRecordIds.length === checkpoint.recordIds.length &&
    checkpoint.verifiedRecordIds.length === checkpoint.recordIds.length;
}
