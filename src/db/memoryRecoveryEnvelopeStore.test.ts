import test from 'node:test';
import assert from 'node:assert/strict';
import { validateOwnerMemoryRecoveryEnvelope } from './memoryRecoveryEnvelopeStore.ts';

const ownerUid = 'owner-uid-123';
const valid = {
  version: 1,
  algorithm: 'HKDF-SHA256-AES-256-GCM',
  context: { ownerUid, keyVersion: 1 },
  salt: 'A'.repeat(43),
  iv: 'B'.repeat(16),
  ciphertext: 'C'.repeat(64),
};

test('accepts a correctly shaped owner-held ciphertext recovery envelope', () => {
  assert.equal(validateOwnerMemoryRecoveryEnvelope(valid, ownerUid, 1), null);
});

test('rejects recovery secrets, plaintext keys, and unexpected fields', () => {
  assert.notEqual(validateOwnerMemoryRecoveryEnvelope({ ...valid, recoveryKey: 'must-not-be-uploaded' }, ownerUid), null);
  assert.notEqual(validateOwnerMemoryRecoveryEnvelope({ ...valid, memoryKey: 'plaintext' }, ownerUid), null);
  assert.notEqual(validateOwnerMemoryRecoveryEnvelope({ ...valid, plaintext: 'secret' }, ownerUid), null);
});

test('rejects another owner or mismatched key version', () => {
  assert.notEqual(validateOwnerMemoryRecoveryEnvelope(valid, 'another-owner', 1), null);
  assert.notEqual(validateOwnerMemoryRecoveryEnvelope(valid, ownerUid, 2), null);
});

test('rejects malformed cryptographic encodings and unsupported algorithms', () => {
  assert.notEqual(validateOwnerMemoryRecoveryEnvelope({ ...valid, algorithm: 'RSA' }, ownerUid), null);
  assert.notEqual(validateOwnerMemoryRecoveryEnvelope({ ...valid, salt: 'short' }, ownerUid), null);
  assert.notEqual(validateOwnerMemoryRecoveryEnvelope({ ...valid, iv: 'short' }, ownerUid), null);
  assert.notEqual(validateOwnerMemoryRecoveryEnvelope({ ...valid, ciphertext: 'short' }, ownerUid), null);
});

test('rejects malformed context and non-object payloads', () => {
  assert.notEqual(validateOwnerMemoryRecoveryEnvelope({ ...valid, context: { ownerUid, keyVersion: 0 } }, ownerUid), null);
  assert.notEqual(validateOwnerMemoryRecoveryEnvelope({ ...valid, context: { ...valid.context, recoveryKey: 'extra' } }, ownerUid), null);
  assert.notEqual(validateOwnerMemoryRecoveryEnvelope(null, ownerUid), null);
});


test('classifies only PostgreSQL unique-constraint violations as immutable-envelope conflicts', async () => {
  const { isOwnerMemoryRecoveryEnvelopeConflict } = await import('./memoryRecoveryEnvelopeStore.ts');
  assert.equal(isOwnerMemoryRecoveryEnvelopeConflict({ code: '23505' }), true);
  assert.equal(isOwnerMemoryRecoveryEnvelopeConflict({ code: '08006' }), false);
  assert.equal(isOwnerMemoryRecoveryEnvelopeConflict(new Error('database unavailable')), false);
  assert.equal(isOwnerMemoryRecoveryEnvelopeConflict(null), false);
});
