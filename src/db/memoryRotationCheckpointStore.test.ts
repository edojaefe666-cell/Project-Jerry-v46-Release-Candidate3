import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMemoryRotationCheckpoint } from '../lib/memoryRotation.ts';

const valid = {
  schemaVersion: 1 as const,
  rotationId: 'rotation_1234567890',
  ownerUid: 'owner-uid-1',
  fromKeyVersion: 1,
  toKeyVersion: 2,
  phase: 'prepared' as const,
  recordIds: ['record_1234567890ab'],
  writtenRecordIds: [],
  verifiedRecordIds: [],
  createdAt: '2026-11-28T12:00:00.000Z',
  updatedAt: '2026-11-28T12:00:00.000Z',
};

test('accepts valid serializable rotation checkpoint metadata', () => {
  assert.equal(validateMemoryRotationCheckpoint(valid), true);
});

test('rejects secret-bearing and unknown checkpoint properties', () => {
  assert.equal(validateMemoryRotationCheckpoint({ ...valid, memoryKey: 'must-not-persist' }), false);
  assert.equal(validateMemoryRotationCheckpoint({ ...valid, recoverySecret: 'must-not-persist' }), false);
});

test('rejects invalid phase, empty or oversized manifests, and inconsistent progress', () => {
  assert.equal(validateMemoryRotationCheckpoint({ ...valid, phase: 'complete' }), false);
  assert.equal(validateMemoryRotationCheckpoint({ ...valid, recordIds: [] }), false);
  assert.equal(validateMemoryRotationCheckpoint({ ...valid, writtenRecordIds: ['record_not_in_manifest'] }), false);
});
