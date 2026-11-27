import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import {
  createDeviceSigningKeyPair,
  signDeviceApprovalChallenge,
  verifyDeviceApprovalProof,
  type DeviceApprovalChallenge,
} from './deviceApprovalSigningProof.ts';

const cryptoProvider = webcrypto as unknown as Crypto;
const challenge: DeviceApprovalChallenge = {
  challengeId: 'challenge_1234567890123456',
  nonce: 'n'.repeat(48),
  ownerUid: 'owner-uid-123',
  approverDeviceId: 'approver_device_123456',
  targetRegistrationId: 'pending_registration_123',
  expiresAt: '2035-01-01T00:00:00.000Z',
};

test('creates a non-extractable ECDSA P-256 signing key and verifies a bound proof', async () => {
  const pair = await createDeviceSigningKeyPair(cryptoProvider);
  assert.equal(pair.privateKey.extractable, false);
  assert.equal(pair.publicKey.crv, 'P-256');
  const proof = await signDeviceApprovalChallenge(challenge, pair.privateKey, Date.parse('2034-01-01'), cryptoProvider);
  assert.equal(await verifyDeviceApprovalProof(challenge, proof, pair.publicKey, Date.parse('2034-01-01'), cryptoProvider), true);
});

test('rejects a proof if owner, approver, target, nonce, or expiry is changed', async () => {
  const pair = await createDeviceSigningKeyPair(cryptoProvider);
  const proof = await signDeviceApprovalChallenge(challenge, pair.privateKey, Date.parse('2034-01-01'), cryptoProvider);
  const changed = [
    { ...challenge, ownerUid: 'other-owner' },
    { ...challenge, approverDeviceId: 'other_device_123456' },
    { ...challenge, targetRegistrationId: 'other_registration_123' },
    { ...challenge, nonce: 'x'.repeat(48) },
    { ...challenge, expiresAt: '2035-01-02T00:00:00.000Z' },
  ];
  for (const candidate of changed) {
    assert.equal(await verifyDeviceApprovalProof(candidate, proof, pair.publicKey, Date.parse('2034-01-01'), cryptoProvider), false);
  }
});

test('rejects expired challenges and proof replay against another challenge id', async () => {
  const pair = await createDeviceSigningKeyPair(cryptoProvider);
  await assert.rejects(() => signDeviceApprovalChallenge(challenge, pair.privateKey, Date.parse('2036-01-01'), cryptoProvider));
  const proof = await signDeviceApprovalChallenge(challenge, pair.privateKey, Date.parse('2034-01-01'), cryptoProvider);
  assert.equal(await verifyDeviceApprovalProof({ ...challenge, challengeId: 'challenge_abcdefghijkl' }, proof, pair.publicKey, Date.parse('2034-01-01'), cryptoProvider), false);
});

test('rejects malformed signatures and private key fields in the public key', async () => {
  const pair = await createDeviceSigningKeyPair(cryptoProvider);
  assert.equal(await verifyDeviceApprovalProof(challenge, { challengeId: challenge.challengeId, signature: 'bad' }, pair.publicKey, Date.parse('2034-01-01'), cryptoProvider), false);
  assert.equal(await verifyDeviceApprovalProof(challenge, { challengeId: challenge.challengeId, signature: 'A'.repeat(86) }, { ...pair.publicKey, d: 'secret' } as never, Date.parse('2034-01-01'), cryptoProvider), false);
});
