import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname, '..');

test('wallet command writes a durable journal outbox event in the same database transaction', () => {
  const source = fs.readFileSync(path.join(root, 'src/db/users.ts'), 'utf8');
  assert.match(source, /enqueueWalletJournalEvent\(tx, user\.id, txRow\)/);
  assert.match(source, /await tx\.insert\(idempotencyKeys\)/);
  assert.ok(source.indexOf('enqueueWalletJournalEvent(tx, user.id, txRow)') < source.indexOf('await tx.insert(idempotencyKeys)'));
});

test('outbox uses tenant-scoped idempotency and retry-safe statuses', () => {
  const sql = fs.readFileSync(path.join(root, 'drizzle/0006_wallet_journal_outbox.sql'), 'utf8');
  assert.match(sql, /UNIQUE \(user_id, event_key\)/);
  assert.match(sql, /status text NOT NULL DEFAULT 'pending'/);
  assert.match(sql, /status IN \('pending','processing','processed'\)/);
});

test('outbox worker leaves failed events pending for retry instead of dropping financial events', () => {
  const source = fs.readFileSync(path.join(root, 'src/db/walletJournalOutbox.ts'), 'utf8');
  assert.match(source, /SET status = 'pending'/);
  assert.match(source, /available_at = now\(\) \+ interval '15 seconds'/);
  assert.match(source, /ON CONFLICT \(user_id, event_key\) DO NOTHING/);
});


test('reorg events remain journalable even after verification is withdrawn', () => {
  const source = fs.readFileSync(path.join(root, 'src/db/users.ts'), 'utf8');
  assert.match(source, /\(\(txRow\.status === 'confirmed' && txRow\.isVerifiedOnChain\) \|\| txRow\.status === 'reorged'\)/);
});
