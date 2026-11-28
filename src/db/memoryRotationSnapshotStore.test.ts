import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

function digest(rows: Array<{recordId:string;keyVersion:number;revision:number;createdAt:string}>): string {
  return createHash('sha256').update(JSON.stringify(rows.map((row, ordinal) => ({
    ordinal, recordId: row.recordId, keyVersion: row.keyVersion,
    revision: row.revision, createdAt: row.createdAt,
  }))), 'utf8').digest('base64url');
}

test('snapshot manifest digest binds IDs, key versions, revisions, immutable creation times and order', () => {
  const rows = [
    { recordId: 'record_aaaaaaaaaaaaaaaa', keyVersion: 1, revision: 4, createdAt: '2026-11-28T10:00:00.000Z' },
    { recordId: 'record_bbbbbbbbbbbbbbbb', keyVersion: 1, revision: 2, createdAt: '2026-11-28T11:00:00.000Z' },
  ];
  assert.equal(digest(rows).length, 43);
  assert.equal(digest(rows), digest([...rows]));
  assert.notEqual(digest(rows), digest([{ ...rows[0], revision: 5 }, rows[1]]));
  assert.notEqual(digest(rows), digest([{ ...rows[0], createdAt: '2026-11-28T10:00:01.000Z' }, rows[1]]));
  assert.notEqual(digest(rows), digest([rows[1], rows[0]]));
  assert.notEqual(digest(rows), digest([rows[0]]));
});
