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
