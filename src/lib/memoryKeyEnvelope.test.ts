import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import {
  createDeviceKeyPair,
  generateMemoryKeyBytes,
  importMemoryDataKey,
  isMemoryKeyContext,
  unwrapMemoryKeyForDevice,
  wrapMemoryKeyForDevice,
  type MemoryKeyContext,
} from './memoryKeyEnvelope.ts';

const cryptoProvider = webcrypto as unknown as Crypto;
const context: MemoryKeyContext = { ownerUid: 'owner-uid-1', deviceId: 'android-device-1', keyVersion: 1 };

test('wraps a random memory key to a device and unwraps the same non-extractable key', async () => {
  const device = await createDeviceKeyPair(cryptoProvider);
  const raw = generateMemoryKeyBytes(cryptoProvider);
  const original = await importMemoryDataKey(raw, cryptoProvider);
  const envelope = await wrapMemoryKeyForDevice(raw, device.publicKey, context, cryptoProvider);
  const restored = await unwrapMemoryKeyForDevice(envelope, device.privateKey, context, cryptoProvider);
  assert.equal(restored.extractable, false);
  const iv = cryptoProvider.getRandomValues(new Uint8Array(12));
  const plaintext = new Uint8Array([1, 2, 3, 4]);
  const ciphertext = await cryptoProvider.subtle.encrypt({ name: 'AES-GCM', iv }, original, plaintext);
  const decrypted = await cryptoProvider.subtle.decrypt({ name: 'AES-GCM', iv }, restored, ciphertext);
  assert.deepEqual(new Uint8Array(decrypted), plaintext);
  raw.fill(0);
});

test('rejects envelopes bound to a different owner, device, or key version', async () => {
  const device = await createDeviceKeyPair(cryptoProvider);
  const raw = generateMemoryKeyBytes(cryptoProvider);
  const envelope = await wrapMemoryKeyForDevice(raw, device.publicKey, context, cryptoProvider);
  await assert.rejects(
    unwrapMemoryKeyForDevice(envelope, device.privateKey, { ...context, deviceId: 'other-device' }, cryptoProvider),
    /context does not match/,
  );
  await assert.rejects(
    unwrapMemoryKeyForDevice(envelope, device.privateKey, { ...context, keyVersion: 2 }, cryptoProvider),
    /context does not match/,
  );
  raw.fill(0);
});

test('rejects ciphertext tampering and a different device private key', async () => {
  const device = await createDeviceKeyPair(cryptoProvider);
  const otherDevice = await createDeviceKeyPair(cryptoProvider);
  const raw = generateMemoryKeyBytes(cryptoProvider);
  const envelope = await wrapMemoryKeyForDevice(raw, device.publicKey, context, cryptoProvider);
  const tampered = { ...envelope, ciphertext: envelope.ciphertext.slice(0, -1) + (envelope.ciphertext.endsWith('A') ? 'B' : 'A') };
  await assert.rejects(unwrapMemoryKeyForDevice(tampered, device.privateKey, context, cryptoProvider));
  await assert.rejects(unwrapMemoryKeyForDevice(envelope, otherDevice.privateKey, context, cryptoProvider));
  raw.fill(0);
});

test('validates context and key material sizes', async () => {
  assert.equal(isMemoryKeyContext(context), true);
  assert.equal(isMemoryKeyContext({ ownerUid: 'a', deviceId: 'b', keyVersion: 1.5 }), false);
  const device = await createDeviceKeyPair(cryptoProvider);
  await assert.rejects(wrapMemoryKeyForDevice(new Uint8Array(16), device.publicKey, context, cryptoProvider), /exactly 32 bytes/);
  await assert.rejects(importMemoryDataKey(new Uint8Array(31), cryptoProvider), /exactly 32 bytes/);
});
