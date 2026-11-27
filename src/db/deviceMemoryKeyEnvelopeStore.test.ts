import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDeviceMemoryKeyEnvelope } from './deviceMemoryKeyEnvelopeStore.ts';

const valid = {
  version: 1,
  algorithm: 'ECDH-P256-HKDF-SHA256-AES-256-GCM',
  context: { ownerUid: 'owner-uid-123', deviceId: 'device_12345678901234567890', keyVersion: 1 },
  ephemeralPublicKey: { kty: 'EC', crv: 'P-256', x: 'A'.repeat(43), y: 'B'.repeat(43) },
  salt: 'C'.repeat(43),
  iv: 'D'.repeat(16),
  ciphertext: 'E'.repeat(64),
};

test('accepts a strictly shaped wrapped memory-key envelope', () => {
  assert.equal(validateDeviceMemoryKeyEnvelope(valid), null);
});

test('rejects plaintext or unexpected envelope fields', () => {
  assert.notEqual(validateDeviceMemoryKeyEnvelope({ ...valid, memoryKey: 'plaintext' }), null);
  assert.notEqual(validateDeviceMemoryKeyEnvelope({ ...valid, title: 'should never be here' }), null);
});

test('rejects private key material in ephemeral public key', () => {
  assert.notEqual(validateDeviceMemoryKeyEnvelope({
    ...valid, ephemeralPublicKey: { ...valid.ephemeralPublicKey, d: 'private-key' },
  }), null);
});

test('rejects wrong owner, device, or key version context', () => {
  assert.notEqual(validateDeviceMemoryKeyEnvelope({
    ...valid, context: { ...valid.context, deviceId: 'another_device_1234567890' },
  }), null);
  assert.notEqual(validateDeviceMemoryKeyEnvelope({
    ...valid, context: { ...valid.context, keyVersion: 0 },
  }), null);
});

test('rejects unsupported algorithms and malformed cryptographic lengths', () => {
  assert.notEqual(validateDeviceMemoryKeyEnvelope({ ...valid, algorithm: 'RSA' }), null);
  assert.notEqual(validateDeviceMemoryKeyEnvelope({ ...valid, salt: 'short' }), null);
  assert.notEqual(validateDeviceMemoryKeyEnvelope({ ...valid, iv: 'short' }), null);
  assert.notEqual(validateDeviceMemoryKeyEnvelope({ ...valid, ciphertext: 'short' }), null);
});
