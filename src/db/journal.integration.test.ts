import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const optedIn = process.env.JERRY_JOURNAL_TEST_DATABASE === '1';
const dbName = process.env.SQL_DB_NAME ?? '';

test('PostgreSQL journal posting, idempotency, reversal and tenant isolation', {
  skip: !optedIn ? 'Set JERRY_JOURNAL_TEST_DATABASE=1 for a disposable PostgreSQL database.' : false,
}, async () => {
  assert.notEqual(process.env.NODE_ENV, 'production');
  assert.ok(process.env.SQL_HOST && process.env.SQL_USER && /test|tenant/i.test(dbName),
    'Journal integration requires SQL_HOST, SQL_USER and a disposable database name containing test/tenant.');
  const { createPool } = await import('./index.ts');
  const { getOrCreateUser } = await import('./users.ts');
  const { postJournalEntry, reversePostedJournalEntry, getJournalAccountBalances } = await import('./journal.ts');
  const pool = createPool(); // Immutable journal fixtures intentionally remain in this disposable test database.
  const suffix = randomUUID();
  const uid = `journal-test-${suffix}`;
  const otherUid = `journal-other-${suffix}`;
  const email = `journal-${suffix}@example.invalid`;
  await getOrCreateUser(uid, email);
  await getOrCreateUser(otherUid, `other-${email}`);
  const input = {
    uid,
    idempotencyKey: `deposit-${suffix}`,
    description: 'Test BTC deposit',
    lines: [
      { accountCode: 'asset:btc:cash', asset: 'BTC', debitUnits: '250000', creditUnits: '0' },
      { accountCode: 'equity:btc:clearing', asset: 'BTC', debitUnits: '0', creditUnits: '250000' },
    ],
  };
  const first = await postJournalEntry(input);
  const replay = await postJournalEntry(input);
  assert.equal(first.status, 'posted');
  assert.equal(replay.id, first.id);
  assert.equal(replay.replayed, true);
  await assert.rejects(postJournalEntry({ ...input, description: 'Changed description' }), /different posting/);
  await assert.rejects(postJournalEntry({ ...input, idempotencyKey: `bad-${suffix}`, lines: [
    { accountCode: 'asset:btc:cash', asset: 'BTC', debitUnits: '10', creditUnits: '0' },
    { accountCode: 'equity:btc:clearing', asset: 'BTC', debitUnits: '0', creditUnits: '9' },
  ] }), /unbalanced/);
  const balances = await getJournalAccountBalances(uid);
  assert.equal(balances.find((row) => row.accountCode === 'asset:btc:cash')?.netDebitUnits, '250000');
  assert.equal((await getJournalAccountBalances(otherUid)).length, 0);

  const reversal = await reversePostedJournalEntry({ uid, originalEntryId: first.id, idempotencyKey: `reverse-${suffix}` });
  assert.equal(reversal.status, 'posted');
  const reversalReplay = await reversePostedJournalEntry({ uid, originalEntryId: first.id, idempotencyKey: `reverse-${suffix}` });
  assert.equal(reversalReplay.id, reversal.id);
  assert.equal(reversalReplay.replayed, true);
  const alternateKeyReplay = await reversePostedJournalEntry({ uid, originalEntryId: first.id, idempotencyKey: `second-reversal-key-${suffix}` });
  assert.equal(alternateKeyReplay.id, reversal.id, 'A different idempotency key must not create a second reversal of the same entry.');
  assert.equal(alternateKeyReplay.replayed, true);
  const concurrentOriginal = await postJournalEntry({
    ...input,
    idempotencyKey: `concurrent-deposit-${suffix}`,
    description: 'Concurrent reversal test deposit',
  });
  const competingReversals = await Promise.all(Array.from({ length: 8 }, (_, index) =>
    reversePostedJournalEntry({
      uid,
      originalEntryId: concurrentOriginal.id,
      idempotencyKey: `concurrent-reversal-${index}-${suffix}`,
    }),
  ));
  assert.equal(new Set(competingReversals.map((entry) => entry.id)).size, 1,
    'Concurrent reversal requests with different keys must converge on one posted reversal.');
  assert.equal(competingReversals.filter((entry) => !entry.replayed).length, 1,
    'Exactly one competing reversal request may create the posting.');
  assert.ok(competingReversals.every((entry) => entry.reversalOf === concurrentOriginal.id));
  await assert.rejects(reversePostedJournalEntry({ uid: otherUid, originalEntryId: first.id, idempotencyKey: `cross-tenant-${suffix}` }), /Only an existing posted journal entry/);
  const after = await getJournalAccountBalances(uid);
  assert.ok(after.every((row) => row.netDebitUnits === '0'), 'A complete reversal must return all account net balances to zero.');
});
