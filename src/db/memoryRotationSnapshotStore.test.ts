import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

function digest(rows: Array<[string, number, number, string]>): string {
  return createHash('sha256').update(
    rows.map(row => row.join('|')).join('\n'), 'utf8',
  ).digest('base64url');
}

test('snapshot manifest digest binds IDs, key versions, revisions and immutable creation times', () => {
  const rows: Array<[string, number, number, string]> = [
    ['record_aaaaaaaaaaaaaaaa', 1, 4, '2026-11-28T10:00:00.000Z'],
    ['record_bbbbbbbbbbbbbbbb', 1, 2, '2026-11-28T11:00:00.000Z'],
  ];
  assert.equal(digest(rows).length, 43);
  assert.notEqual(digest(rows), digest([[rows[0][0], 1, 5, rows[0][3]], rows[1]]));
  assert.notEqual(digest(rows), digest([[rows[0][0], 1, 4, '2026-11-28T10:00:01.000Z'], rows[1]]));
  assert.notEqual(digest(rows), digest([rows[1], rows[0]]));
  assert.notEqual(digest(rows), digest([rows[0]]));
});
