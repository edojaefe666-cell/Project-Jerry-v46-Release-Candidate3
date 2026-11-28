import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeMemoryPageCursor, encodeMemoryPageCursor } from './memoryCursor.ts';

test('memory page cursor round-trips a stable timestamp and id', () => {
  const cursor = { createdAt: '2026-11-26T12:00:00.000Z', id: 'memory-123' };
  assert.deepEqual(decodeMemoryPageCursor(encodeMemoryPageCursor(cursor)), cursor);
});

test('memory page cursor rejects malformed, oversized and unsupported values', () => {
  for (const value of [undefined, '', 'not-a-cursor', '!', 'e30', 'A'.repeat(513)]) {
    assert.equal(decodeMemoryPageCursor(value), null);
  }
  const unsupported = Buffer.from(JSON.stringify({ v: 2, createdAt: '2026-11-26T12:00:00Z', id: 'x' })).toString('base64url');
  assert.equal(decodeMemoryPageCursor(unsupported), null);
});

import {
  decodeEncryptedMemorySnapshotCursor,
  encodeEncryptedMemorySnapshotCursor,
} from './memoryCursor.ts';

test('encrypted memory snapshot cursor round-trips watermark and keyset position', () => {
  const value = {
    snapshotAt: '2026-11-28T12:00:00.000Z',
    lastCreatedAt: '2026-11-28T11:59:00.000Z',
    lastId: 'record_1234567890ab',
  };
  assert.deepEqual(decodeEncryptedMemorySnapshotCursor(encodeEncryptedMemorySnapshotCursor(value)), value);
});

test('encrypted memory snapshot cursor rejects tampered shapes and dates after watermark', () => {
  const afterWatermark = Buffer.from(JSON.stringify({
    v: 2, snapshotAt: '2026-11-28T12:00:00.000Z',
    lastCreatedAt: '2026-11-28T12:01:00.000Z', lastId: 'record_1234567890ab',
  })).toString('base64url');
  assert.equal(decodeEncryptedMemorySnapshotCursor(afterWatermark), null);
  assert.equal(decodeEncryptedMemorySnapshotCursor('not-valid!'), null);
});
