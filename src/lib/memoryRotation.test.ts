import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMemoryRotationCheckpoint,
  markMemoryRotationRecordWritten,
  markMemoryRotationRecordVerified,
  pauseMemoryRotation,
  resumeMemoryRotation,
  abortMemoryRotation,
  isMemoryRotationReadyForOwnerApproval,
  validateMemoryRotationCheckpoint,
} from './memoryRotation.ts';

const now = new Date('2026-11-28T12:00:00.000Z');
const input = {
  rotationId: 'rotation_1234567890',
  ownerUid: 'owner-uid-1',
  fromKeyVersion: 4,
  recordIds: ['record_abcdefghijkl', 'record_1234567890ab'],
  now,
};

test('creates a secret-free checkpoint with a deterministic record manifest', () => {
  const checkpoint = createMemoryRotationCheckpoint(input);
  assert.equal(checkpoint.toKeyVersion, 5);
  assert.deepEqual(checkpoint.recordIds, [...input.recordIds].sort());
  assert.equal(checkpoint.phase, 'prepared');
  assert.equal(JSON.stringify(checkpoint).includes('memoryKey'), false);
  assert.equal(validateMemoryRotationCheckpoint(checkpoint), true);
});

test('requires every record write and verification before owner approval readiness', () => {
  let state = createMemoryRotationCheckpoint(input);
  state = markMemoryRotationRecordWritten(state, state.recordIds[0], now);
  assert.equal(state.phase, 'applying');
  state = markMemoryRotationRecordWritten(state, state.recordIds[1], now);
  assert.equal(state.phase, 'verifying');
  state = markMemoryRotationRecordVerified(state, state.recordIds[0], now);
  assert.equal(isMemoryRotationReadyForOwnerApproval(state), false);
  state = markMemoryRotationRecordVerified(state, state.recordIds[1], now);
  assert.equal(isMemoryRotationReadyForOwnerApproval(state), true);
  assert.equal(state.phase, 'ready_for_owner_approval');
});

test('pauses and resumes from checkpointed progress without losing completed work', () => {
  let state = createMemoryRotationCheckpoint(input);
  state = markMemoryRotationRecordWritten(state, state.recordIds[0], now);
  state = pauseMemoryRotation(state, now);
  assert.equal(state.phase, 'paused');
  state = resumeMemoryRotation(state, now);
  assert.equal(state.phase, 'applying');
  assert.deepEqual(state.writtenRecordIds, [input.recordIds[1], input.recordIds[0]].sort());
});

test('rejects writes while paused, unmanifested IDs, and verification before writes', () => {
  let state = createMemoryRotationCheckpoint(input);
  assert.throws(() => markMemoryRotationRecordVerified(state, state.recordIds[0], now), /written/);
  assert.throws(() => markMemoryRotationRecordWritten(state, 'record_not_in_manifest', now), /cannot accept/);
  state = pauseMemoryRotation(state, now);
  assert.throws(() => markMemoryRotationRecordWritten(state, state.recordIds[0], now), /cannot accept/);
});

test('aborts incomplete rotations but does not silently discard a fully verified one', () => {
  let state = createMemoryRotationCheckpoint(input);
  state = abortMemoryRotation(state, now);
  assert.equal(state.phase, 'aborted');
  let ready = createMemoryRotationCheckpoint(input);
  for (const id of ready.recordIds) ready = markMemoryRotationRecordWritten(ready, id, now);
  for (const id of ready.recordIds) ready = markMemoryRotationRecordVerified(ready, id, now);
  assert.throws(() => abortMemoryRotation(ready, now), /explicit owner decision/);
});

test('rejects corrupt checkpoint relationships and mixed version transitions', () => {
  const state = createMemoryRotationCheckpoint(input);
  assert.equal(validateMemoryRotationCheckpoint({ ...state, toKeyVersion: 9 }), false);
  assert.equal(validateMemoryRotationCheckpoint({ ...state, writtenRecordIds: ['record_not_in_manifest'] }), false);
  assert.equal(validateMemoryRotationCheckpoint({ ...state, recordIds: [state.recordIds[0], state.recordIds[0]] }), false);
});
