import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEncryptedMemoryRecord } from './encryptedMemoryStore.ts';

const valid = {
  schemaVersion: 1,
  recordId: 'record_1234567890abcdef',
  keyVersion: 1,
  revision: 1,
  iv: 'A'.repeat(16),
  ciphertext: 'A'.repeat(23),
};

test('accepts the minimal ciphertext-only transport envelope', () => {
  assert.equal(validateEncryptedMemoryRecord(valid), null);
});
test('rejects plaintext metadata and malformed crypto envelope fields', () => {
  for (const invalid of [
    { ...valid, title: 'plaintext title' },
    { ...valid, content: 'plaintext content' },
    { ...valid, tags: ['plaintext tag'] },
    { ...valid, keyVersion: 0 },
    { ...valid, revision: 0 },
    { ...valid, recordId: 'short' },
    { ...valid, iv: 'A'.repeat(15) },
    { ...valid, ciphertext: 'A'.repeat(64_001) },
    { ...valid, ciphertext: 'invalid+' },
  ]) assert.notEqual(validateEncryptedMemoryRecord(invalid), null);
});
test('rejects missing and non-object envelopes', () => {
  assert.notEqual(validateEncryptedMemoryRecord(null), null);
  assert.notEqual(validateEncryptedMemoryRecord('ciphertext'), null);
});
