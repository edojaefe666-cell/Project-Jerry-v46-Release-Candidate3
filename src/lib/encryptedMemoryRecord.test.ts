import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { encryptMemoryRecord, decryptMemoryRecord, type EncryptedMemoryPayload, type MemoryRecordContext } from './encryptedMemoryRecord.ts';

const cryptoProvider = webcrypto as unknown as Crypto;
const context: MemoryRecordContext = { ownerUid: 'owner-uid-1', recordId: 'record_1234567890abcdef', keyVersion: 1, revision: 1 };
const payload: EncryptedMemoryPayload = {
  schemaVersion: 1, id: context.recordId, category: 'preference', area: 'owner_profile',
  title: 'Owner preference', content: 'The owner prefers concise engineering updates.',
  outcome: 'insight', tags: ['owner-taught', 'preference'],
  createdAt: '2026-11-27T12:00:00.000Z', updatedAt: '2026-11-27T12:00:00.000Z', deleted: false,
};
async function createKey(): Promise<CryptoKey> {
  return cryptoProvider.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']) as Promise<CryptoKey>;
}

test('encrypts every memory field and round-trips only on the client', async () => {
  const key = await createKey();
  const record = await encryptMemoryRecord(payload, key, context, cryptoProvider);
  const wire = JSON.stringify(record);
  for (const secret of [payload.title, payload.content, ...payload.tags, payload.category, payload.area, payload.createdAt]) {
    assert.equal(wire.includes(secret), false);
  }
  assert.deepEqual(await decryptMemoryRecord(record, key, context, cryptoProvider), payload);
  assert.equal(record.keyVersion, context.keyVersion);
  assert.equal(record.revision, context.revision);
});
test('binds ciphertext to owner, record ID, key version, and revision', async () => {
  const key = await createKey();
  const record = await encryptMemoryRecord(payload, key, context, cryptoProvider);
  for (const altered of [
    { ...context, ownerUid: 'other-owner' }, { ...context, recordId: 'record_abcdef1234567890' },
    { ...context, keyVersion: 2 }, { ...context, revision: 2 },
  ]) await assert.rejects(decryptMemoryRecord(record, key, altered, cryptoProvider));
});
test('rejects tampering, wrong keys, malformed IVs, and oversized ciphertext', async () => {
  const key = await createKey();
  const otherKey = await createKey();
  const record = await encryptMemoryRecord(payload, key, context, cryptoProvider);
  const tampered = { ...record, ciphertext: record.ciphertext.slice(0, -1) + (record.ciphertext.endsWith('A') ? 'B' : 'A') };
  await assert.rejects(decryptMemoryRecord(tampered, key, context, cryptoProvider));
  await assert.rejects(decryptMemoryRecord(record, otherKey, context, cryptoProvider));
  await assert.rejects(decryptMemoryRecord({ ...record, iv: 'bad!' }, key, context, cryptoProvider), /encoding/);
  await assert.rejects(decryptMemoryRecord({ ...record, ciphertext: 'A'.repeat(64_001) }, key, context, cryptoProvider), /encoding/);
});
test('uses a fresh random nonce for every encryption of the same record', async () => {
  const key = await createKey();
  const first = await encryptMemoryRecord(payload, key, context, cryptoProvider);
  const second = await encryptMemoryRecord(payload, key, context, cryptoProvider);
  assert.notEqual(first.iv, second.iv);
  assert.notEqual(first.ciphertext, second.ciphertext);
});
test('rejects payloads whose opaque ID or encrypted metadata is invalid', async () => {
  const key = await createKey();
  await assert.rejects(encryptMemoryRecord({ ...payload, id: 'another_record_123456' }, key, context, cryptoProvider), /payload fields/);
  await assert.rejects(encryptMemoryRecord({ ...payload, tags: ['x'.repeat(81)] }, key, context, cryptoProvider), /payload fields/);
  await assert.rejects(encryptMemoryRecord({ ...payload, deleted: 'false' as unknown as boolean }, key, context, cryptoProvider), /payload fields/);
});

test('re-encrypts a record under the next key version and verifies the result', async () => {
  const oldKey = await createKey();
  const newKey = await createKey();
  const original = await encryptMemoryRecord(payload, oldKey, context, cryptoProvider);
  const { reencryptMemoryRecordForKeyRotation } = await import('./encryptedMemoryRecord.ts');
  const rotated = await reencryptMemoryRecordForKeyRotation(original, oldKey, newKey, context, cryptoProvider);
  const nextContext = { ...context, keyVersion: 2, revision: 2 };
  assert.equal(rotated.recordId, original.recordId);
  assert.equal(rotated.keyVersion, 2);
  assert.equal(rotated.revision, 2);
  assert.notEqual(rotated.iv, original.iv);
  assert.notEqual(rotated.ciphertext, original.ciphertext);
  assert.deepEqual(await decryptMemoryRecord(rotated, newKey, nextContext, cryptoProvider), payload);
  await assert.rejects(decryptMemoryRecord(rotated, oldKey, nextContext, cryptoProvider));
  await assert.rejects(decryptMemoryRecord(original, newKey, context, cryptoProvider));
});

test('rejects rotation when source context is stale or malformed', async () => {
  const oldKey = await createKey();
  const newKey = await createKey();
  const original = await encryptMemoryRecord(payload, oldKey, context, cryptoProvider);
  const { reencryptMemoryRecordForKeyRotation } = await import('./encryptedMemoryRecord.ts');
  await assert.rejects(reencryptMemoryRecordForKeyRotation(original, oldKey, newKey, { ...context, revision: 2 }, cryptoProvider), /source record/);
});
