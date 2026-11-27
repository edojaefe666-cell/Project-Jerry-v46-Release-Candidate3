import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import {
  canonicalDeviceHttpChallenge, digestDeviceHttpBody, isAllowedEncryptedMemoryTarget,
  verifyDeviceHttpRequestProof, type DeviceHttpRequestChallenge,
} from './deviceHttpRequestProof.ts';

const cryptoProvider = webcrypto as unknown as Crypto;
const now = Date.parse('2026-11-27T12:00:00.000Z');
const body = new TextEncoder().encode('{"schemaVersion":1,"recordId":"record_1234567890abcdef"}');
const challenge: DeviceHttpRequestChallenge = {
  challengeId: 'challenge_1234567890',
  nonce: 'A'.repeat(43),
  ownerUid: 'owner-uid-1',
  deviceId: 'device_1234567890',
  method: 'POST',
  path: '/api/memory/encrypted',
  bodySha256: '',
  expiresAt: new Date(now + 30_000).toISOString(),
};

test('allows only canonical encrypted-memory paths and methods', () => {
  assert.equal(isAllowedEncryptedMemoryTarget('GET', '/api/memory/encrypted'), true);
  assert.equal(isAllowedEncryptedMemoryTarget('POST', '/api/memory/encrypted'), true);
  assert.equal(isAllowedEncryptedMemoryTarget('PUT', '/api/memory/encrypted/record_1234567890abcdef'), true);
  for (const [method, path] of [
    ['DELETE', '/api/memory/encrypted'], ['POST', '/api/memory/encrypted/x'],
    ['GET', '/api/memory/encrypted?limit=10'], ['GET', '/api/memory/../wallet'],
    ['GET', '/api/memory/%65ncrypted'], ['GET', '/api/security/emergency-stop'],
  ]) assert.equal(isAllowedEncryptedMemoryTarget(method, path), false);
});

test('canonical challenge binds operation, owner, device, body digest and expiry', async () => {
  const digest = await digestDeviceHttpBody(body, cryptoProvider);
  const valid = { ...challenge, bodySha256: digest };
  const canonical = new TextDecoder().decode(canonicalDeviceHttpChallenge(valid, now));
  for (const field of ['jerry-device-http-v1', valid.challengeId, valid.ownerUid, valid.deviceId, valid.method, valid.path, digest, valid.expiresAt]) {
    assert.ok(canonical.includes(field));
  }
  assert.throws(() => canonicalDeviceHttpChallenge({ ...valid, path: '/api/wallet' }, now));
  assert.throws(() => canonicalDeviceHttpChallenge({ ...valid, expiresAt: new Date(now + 90_000).toISOString() }, now));
});

test('verifies ECDSA proof only for the exact challenge and body bytes', async () => {
  const pair = await cryptoProvider.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']) as CryptoKeyPair;
  const jwk = await cryptoProvider.subtle.exportKey('jwk', pair.publicKey);
  const digest = await digestDeviceHttpBody(body, cryptoProvider);
  const valid = { ...challenge, bodySha256: digest };
  const signature = await cryptoProvider.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey,
    canonicalDeviceHttpChallenge(valid, now).slice().buffer as ArrayBuffer,
  );
  const bytes = new Uint8Array(signature);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const proof = { challengeId: valid.challengeId, signature: btoa(binary).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/g, '') };
  const publicKey = { kty: 'EC' as const, crv: 'P-256' as const, x: jwk.x!, y: jwk.y! };
  assert.equal(await verifyDeviceHttpRequestProof(valid, proof, publicKey, body, now, cryptoProvider), true);
  assert.equal(await verifyDeviceHttpRequestProof(valid, proof, publicKey, new TextEncoder().encode('tampered'), now, cryptoProvider), false);
  assert.equal(await verifyDeviceHttpRequestProof({ ...valid, path: '/api/memory/encrypted/record_1234567890abcdef' }, proof, publicKey, body, now, cryptoProvider), false);
  assert.equal(await verifyDeviceHttpRequestProof(valid, { ...proof, challengeId: 'challenge_other_12345' }, publicKey, body, now, cryptoProvider), false);
  assert.equal(await verifyDeviceHttpRequestProof(valid, proof, publicKey, body, now + 31_000, cryptoProvider), false);
});
