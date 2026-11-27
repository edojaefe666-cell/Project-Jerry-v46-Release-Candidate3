import test from 'node:test';
import assert from 'node:assert/strict';
import { assertValidDeviceRegistrationInput } from './deviceRegistrationStore.ts';

const valid = {
  deviceId: 'device_12345678901234567890',
  deviceName: 'Jerry Android',
  platform: 'android' as const,
  exchangePublicKey: {
    kty: 'EC' as const,
    crv: 'P-256' as const,
    x: 'A'.repeat(43),
    y: 'B'.repeat(43),
    ext: true,
    key_ops: [],
  },
};

test('accepts a public P-256 exchange key and bounded device metadata', () => {
  assert.doesNotThrow(() => assertValidDeviceRegistrationInput(valid));
});

test('rejects malformed device identifiers', () => {
  assert.throws(() => assertValidDeviceRegistrationInput({ ...valid, deviceId: 'short' }));
});

test('rejects empty or oversized device names', () => {
  assert.throws(() => assertValidDeviceRegistrationInput({ ...valid, deviceName: ' ' }));
  assert.throws(() => assertValidDeviceRegistrationInput({ ...valid, deviceName: 'x'.repeat(81) }));
});

test('rejects unsupported platforms', () => {
  assert.throws(() => assertValidDeviceRegistrationInput({ ...valid, platform: 'desktop' as never }));
});

test('rejects non-P-256 and malformed public keys', () => {
  assert.throws(() => assertValidDeviceRegistrationInput({
    ...valid, exchangePublicKey: { ...valid.exchangePublicKey, crv: 'P-384' as never },
  }));
  assert.throws(() => assertValidDeviceRegistrationInput({
    ...valid, exchangePublicKey: { ...valid.exchangePublicKey, x: 'bad' },
  }));
});

test('rejects private key material', () => {
  assert.throws(() => assertValidDeviceRegistrationInput({
    ...valid, exchangePublicKey: { ...valid.exchangePublicKey, d: 'private-material' } as never,
  }));
});
