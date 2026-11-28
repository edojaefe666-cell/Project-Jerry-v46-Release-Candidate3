import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { verifyMemoryRotationSnapshotManifest, type MemoryRotationSnapshotRecord } from '../lib/memoryRotationSnapshot.ts';

const cryptoProvider = webcrypto as unknown as Crypto;
const records: MemoryRotationSnapshotRecord[] = [
  { ordinal: 0, recordId: 'record_aaaaaaaaaaaaaaaa', keyVersion: 1, revision: 4, createdAt: '2026-11-28T10:00:00.000Z' },
  { ordinal: 1, recordId: 'record_bbbbbbbbbbbbbbbb', keyVersion: 1, revision: 2, createdAt: '2026-11-28T11:00:00.000Z' },
];

async function makeManifest(items = records) {
  const canonical = JSON.stringify(items.map(record => ({
    ordinal: record.ordinal, recordId: record.recordId, keyVersion: record.keyVersion,
    revision: record.revision, createdAt: record.createdAt,
  })));
  const digest = new Uint8Array(await cryptoProvider.subtle.digest('SHA-256', new TextEncoder().encode(canonical)));
  let binary = ''; for (const byte of digest) binary += String.fromCharCode(byte);
  return {
    fromKeyVersion: 1, totalRecords: items.length,
    manifestSha256: btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/g,''),
    records: items,
  };
}

test('verifies a complete snapshot using the exact server manifest canonicalization', async () => {
  assert.equal(await verifyMemoryRotationSnapshotManifest(await makeManifest(), cryptoProvider), true);
});

test('rejects missing, reordered, duplicated, tampered and wrong-version manifest entries', async () => {
  const valid = await makeManifest();
  assert.equal(await verifyMemoryRotationSnapshotManifest({ ...valid, records: valid.records.slice(0, 1) }, cryptoProvider), false);
  assert.equal(await verifyMemoryRotationSnapshotManifest({ ...valid, records: [...valid.records].reverse() }, cryptoProvider), false);
  const duplicate = [records[0], { ...records[1], recordId: records[0].recordId, ordinal: 1 }];
  assert.equal(await verifyMemoryRotationSnapshotManifest(await makeManifest(duplicate), cryptoProvider), false);
  const changed = [records[0], { ...records[1], revision: 3 }];
  assert.equal(await verifyMemoryRotationSnapshotManifest(await makeManifest(changed), cryptoProvider), false);
  const wrongVersion = [records[0], { ...records[1], keyVersion: 2 }];
  assert.equal(await verifyMemoryRotationSnapshotManifest(await makeManifest(wrongVersion), cryptoProvider), false);
});
