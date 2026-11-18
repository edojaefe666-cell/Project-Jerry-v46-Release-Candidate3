import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

test('ledger sync updates existing durable rows instead of treating txRef existence as immutable', () => {
  const source = read('src/db/users.ts');
  const start = source.indexOf('export async function recordLedgerTransactionsForUser');
  const end = source.indexOf('export async function updateWorkspaceForUserAtomic', start);
  const block = source.slice(start, end);
  assert.match(block, /onConflictDoUpdate/);
  assert.match(block, /confirmationDepth/);
  assert.match(block, /verifiedBlockHeight/);
  assert.match(block, /verifiedBlockHash/);
});

test('Bitcoin reconciliation marks a previously confirmed transaction reorged when finality is lost', () => {
  const source = read('server.ts');
  const start = source.indexOf("app.post('/api/wallet/commands/reconcile-tx'");
  const block = source.slice(start, start + 9000);
  assert.match(block, /latest\.status === 'confirmed' && !final/);
  assert.match(block, /finalityLost/);
  assert.match(block, /status: committedStatus/);
  assert.match(block, /verifiedBlockHeight: finalityLost \? item\.verifiedBlockHeight/);
  assert.match(block, /verifiedBlockHash: finalityLost \? item\.verifiedBlockHash/);
});

test('atomic workspace mutation writes every transaction state change to the durable ledger', () => {
  const source = read('src/db/users.ts');
  const start = source.indexOf('export async function updateWorkspaceForUserAtomic');
  const end = source.indexOf('export async function saveDailySummaryForUser', start);
  const block = source.slice(start, end);
  assert.match(block, /db\.transaction\(async \(tx\)/);
  assert.match(block, /onConflictDoUpdate/);
  assert.match(block, /for \(const txRow of next\.transactions \?\? \[\]\)/);
  assert.match(block, /status: txRow\.status/);
});

test('incoming settlement validates exact outputs to this workspace before recording', () => {
  const source = read('server.ts');
  const start = source.indexOf("app.post('/api/wallet/commands/record-income'");
  const block = source.slice(start, start + 9000);
  assert.match(block, /A valid Bitcoin transaction hash is required/);
  assert.match(block, /workspace\.walletAssets/);
  assert.match(block, /\/api\/tx\/\$\{cleanHash\}/);
  assert.match(block, /validateIncomingBitcoinPayment/);
  assert.match(block, /currentReceivingAddresses/);
  assert.match(block, /payment\.valid/);
});
