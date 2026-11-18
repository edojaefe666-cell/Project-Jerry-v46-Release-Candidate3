import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

test('legacy and Cloud SQL workspace writes preserve server-owned financial/security state', () => {
  const source = read('server.ts');
  const start = source.indexOf('const mergeClientWorkspaceState');
  const end = source.indexOf('// Legacy state routes', start);
  const block = source.slice(start, end);

  for (const field of [
    'walletAssets',
    'externalWallets',
    'transactions',
    'profitReserveUsd',
    'approvals',
    'selfUpgrades',
    'lastWalletSyncAt',
  ]) {
    assert.match(block, new RegExp(`${field}: authoritative\\.${field}`));
  }

  assert.match(source, /app\.put\('\/api\/state'/);
  assert.match(source, /app\.put\('\/api\/cloudsql\/workspace'/);
  assert.match(source, /mergeClientWorkspaceState\(latest, incoming\)/);
});

test('financial workspace writes are serialized through the per-user transaction lock', () => {
  const source = read('src/db/users.ts');
  const start = source.indexOf('export async function updateWorkspaceForUserAtomic');
  const end = source.indexOf('export async function saveDailySummaryForUser', start);
  const block = source.slice(start, end);
  assert.match(block, /db\.transaction\(async \(tx\)/);
  assert.match(block, /pg_advisory_xact_lock\(hashtext\(\$\{uid\}\)/);
  assert.match(block, /SELECT pg_advisory_xact_lock/);
});

test('client state load has an active-request guard so an unmounted or stale response cannot set state', () => {
  const source = read('src/App.tsx');
  const start = source.indexOf("apiFetch('/api/state'");
  const block = source.slice(Math.max(0, start - 450), start + 1800);
  assert.match(block, /let active = true/);
  assert.match(block, /if \(active && data && data\.owner\)/);
  assert.match(block, /active = false/);
});

test('client persistence cannot overwrite protected financial fields through generic workspace PUTs', () => {
  const source = read('server.ts');
  const putStart = source.indexOf("app.put('/api/state'");
  const putEnd = source.indexOf("app.post('/api/state/reset'", putStart);
  const block = source.slice(putStart, putEnd);
  assert.match(block, /updateWorkspaceForUserAtomic/);
  assert.match(block, /mergeClientWorkspaceState\(latest, incoming\)/);
  assert.doesNotMatch(block, /saveWorkspaceForUser\(uid, email, incoming\)/);
});
