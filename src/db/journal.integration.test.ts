import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const optedIn = process.env.JERRY_JOURNAL_TEST_DATABASE === '1';
const dbName = process.env.SQL_DB_NAME ?? '';

test('PostgreSQL journal posting, idempotency, reversal and tenant isolation', {
  skip: !optedIn ? 'Set JERRY_JOURNAL_TEST_DATABASE=1 for a disposable PostgreSQL database.' : false,
}, async (t) => {
  assert.notEqual(process.env.NODE_ENV, 'production');
  assert.ok(process.env.SQL_HOST && process.env.SQL_USER && /test|tenant/i.test(dbName),
    'Journal integration requires SQL_HOST, SQL_USER and a disposable database name containing test/tenant.');
  const { createPool } = await import('./index.ts');
  const { getOrCreateUser } = await import('./users.ts');
  const { updateSharedExecutionControl } = await import('./executionControl.ts');
  const { postJournalEntry, reversePostedJournalEntry, getJournalAccountBalances } = await import('./journal.ts');
  const pool = createPool(); // Immutable journal fixtures intentionally remain in this disposable test database.
  const suffix = randomUUID();
  const uid = `journal-test-${suffix}`;
  const otherUid = `journal-other-${suffix}`;
  const email = `journal-${suffix}@example.invalid`;
  await getOrCreateUser(uid, email);
  await getOrCreateUser(otherUid, `other-${email}`);
  // Shared execution control defaults to stopped. Explicitly enable it only
  // inside this disposable integration fixture so live outbox processing is
  // tested under the same authorization state as its dedicated worker suite.
  await updateSharedExecutionControl({
    stopped: false,
    actorUid: uid,
    reason: 'Disposable journal integration fixture enabled execution',
  });
  t.after(async () => {
    await updateSharedExecutionControl({
      stopped: true,
      actorUid: uid,
      reason: 'Disposable journal integration fixture cleanup stop',
    });
  });
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

  // A transaction can be confirmed, reorged, reconfirmed in a new block
  // generation, and reorged again. Each confirmation must have its own
  // independently reversible journal posting.
  const { ensureWalletTransactionJournaled } = await import('./walletJournal.ts');
  const lifecycleTx = {
    id: `lifecycle-${suffix}`,
    timestamp: new Date().toISOString(),
    type: 'incoming' as const,
    asset: 'BTC' as const,
    network: 'Bitcoin Mainnet',
    amount: 0.001,
    fee: 0,
    counterparty: 'disposable-reorg-lifecycle-test',
    status: 'confirmed' as const,
    note: 'verified reorg lifecycle fixture',
    isVerifiedOnChain: true,
    confirmationDepth: 6,
    verifiedBlockHeight: 900000,
    verifiedBlockHash: 'a'.repeat(64),
    journalCycle: 0,
  };
  const firstConfirmation = await ensureWalletTransactionJournaled(uid, lifecycleTx);
  assert.equal(firstConfirmation.action, 'posted');
  const firstReorgTx = {
    ...lifecycleTx,
    status: 'reorged' as const,
    isVerifiedOnChain: false,
  };
  const firstReversal = await ensureWalletTransactionJournaled(uid, firstReorgTx);
  const firstReversalReplay = await ensureWalletTransactionJournaled(uid, firstReorgTx);
  assert.equal(firstReversal.action, 'reversed');
  assert.equal(firstReversalReplay.journalEntryId, firstReversal.journalEntryId,
    'Re-delivery of the first reorg must replay the same reversal.');

  const secondConfirmationTx = {
    ...lifecycleTx,
    verifiedBlockHeight: 900010,
    verifiedBlockHash: 'b'.repeat(64),
    journalCycle: 1,
  };
  const secondConfirmation = await ensureWalletTransactionJournaled(uid, secondConfirmationTx);
  assert.equal(secondConfirmation.action, 'posted',
    'A reconfirmation in a new block generation must create a new journal posting.');
  const secondReorgTx = {
    ...secondConfirmationTx,
    status: 'reorged' as const,
    isVerifiedOnChain: false,
  };
  const secondReversal = await ensureWalletTransactionJournaled(uid, secondReorgTx);
  const secondReversalReplay = await ensureWalletTransactionJournaled(uid, secondReorgTx);
  assert.equal(secondReversal.action, 'reversed');
  assert.equal(secondReversalReplay.journalEntryId, secondReversal.journalEntryId,
    'Re-delivery of the second reorg must replay the same reversal.');

  const lifecycleEntries = await pool.query(
    `SELECT id::text, idempotency_key, reversal_of::text, status
       FROM journal_entries
      WHERE user_id = (SELECT id FROM users WHERE uid = $1)
        AND idempotency_key LIKE $2
      ORDER BY id`,
    [uid, `wallet-tx:${lifecycleTx.id}:%`],
  );
  const postedConfirmations = lifecycleEntries.rows.filter((row) =>
    row.status === 'posted' && row.idempotency_key.includes(':confirmed:'));
  const postedReversals = lifecycleEntries.rows.filter((row) =>
    row.status === 'posted' && row.idempotency_key.includes(':reorg-reversal:'));
  assert.equal(postedConfirmations.length, 2,
    'Both distinct confirmation generations must be posted exactly once.');
  assert.equal(postedReversals.length, 2,
    'Both confirmation generations must be reversed exactly once.');
  assert.deepEqual(
    new Set(postedReversals.map((row) => row.reversal_of)),
    new Set(postedConfirmations.map((row) => row.id)),
    'Each reversal must target its own confirmation generation, never the earlier generation.',
  );
  const lifecycleBalances = await getJournalAccountBalances(uid);
  assert.ok(lifecycleBalances.every((row) => row.netDebitUnits === '0'),
    'After both reorgs, every lifecycle account balance must be fully reversed.');

  const after = await getJournalAccountBalances(uid);
  assert.ok(after.every((row) => row.netDebitUnits === '0'), 'A complete reversal must return all account net balances to zero.');
  // Historical backfill and the live outbox worker may race on the same
  // confirmed transaction. Both must converge on one generation-scoped posting.
  const { backfillHistoricalWalletJournal } = await import('./financialReconciliation.ts');
  const { drainWalletJournalOutbox } = await import('./walletJournalOutbox.ts');
  const { getWalletJournalEventKey } = await import('../lib/walletJournalPolicy.ts');
  const repairTx = {
    id: `repair-race-${suffix}`,
    timestamp: new Date().toISOString(),
    type: 'incoming' as const,
    asset: 'BTC' as const,
    network: 'Bitcoin Mainnet',
    amount: 0.002,
    fee: 0,
    counterparty: 'disposable-backfill-concurrency-test',
    status: 'confirmed' as const,
    note: 'verified historical repair race fixture',
    isVerifiedOnChain: true,
    confirmationDepth: 6,
    verifiedBlockHeight: 900100,
    verifiedBlockHash: 'd'.repeat(64),
  };
  await pool.query(
    `INSERT INTO ledger_transactions
      (user_id, tx_ref, timestamp, tx_type, asset, network, amount, fee, counterparty,
       status, note, tx_hash, is_verified_on_chain, confirmation_depth,
       verified_block_height, verified_block_hash)
     VALUES ((SELECT id FROM users WHERE uid = $1), $2, $3, 'incoming', 'BTC',
       'Bitcoin Mainnet', $4, 0, $5, 'confirmed', $6, $7, true, 6, 900100, $8)`,
    [uid, repairTx.id, repairTx.timestamp, repairTx.amount, repairTx.counterparty,
      repairTx.note, `hash-${suffix}`, repairTx.verifiedBlockHash],
  );
  const repairEventKey = getWalletJournalEventKey(repairTx);
  await pool.query(
    `INSERT INTO wallet_journal_outbox
      (user_id, event_key, tx_ref, payload_json, status, available_at)
     VALUES ((SELECT id FROM users WHERE uid = $1), $2, $3, $4::jsonb, 'pending', now())`,
    [uid, repairEventKey, repairTx.id, JSON.stringify(repairTx)],
  );

  const [repairResult, workerResult] = await Promise.all([
    backfillHistoricalWalletJournal(uid),
    drainWalletJournalOutbox(uid, 10),
  ]);
  assert.equal(workerResult.failed, 0, 'Live outbox processing must not fail during historical repair.');
  assert.equal(repairResult.skipped, 0, 'Eligible verified historical transaction must not be skipped.');
  const repairJournalRows = await pool.query(
    'SELECT id::text FROM journal_entries WHERE user_id = (SELECT id FROM users WHERE uid = $1) AND idempotency_key = $2 AND status = \'posted\'',
    [uid, repairEventKey],
  );
  assert.equal(repairJournalRows.rowCount, 1,
    'Backfill and live outbox worker must converge on exactly one posted generation.');
  const repairReplay = await backfillHistoricalWalletJournal(uid);
  assert.equal(repairReplay.posted, 0, 'A repeated repair must not create another posting.');
  assert.equal(repairReplay.replayed, 1, 'A repeated repair must report the existing journal posting as replayed.');

  // A historical reorg repair and the live reorg outbox worker may race.
  // Both must converge on exactly one reversal of the same confirmation.
  const repairReorgTx = {
    ...repairTx,
    status: 'reorged' as const,
    isVerifiedOnChain: false,
  };
  await pool.query(
    'UPDATE ledger_transactions SET status = \'reorged\', is_verified_on_chain = false WHERE user_id = (SELECT id FROM users WHERE uid = $1) AND tx_ref = $2',
    [uid, repairTx.id],
  );
  const reorgEventKey = getWalletJournalEventKey(repairReorgTx);
  await pool.query(
    `INSERT INTO wallet_journal_outbox
      (user_id, event_key, tx_ref, payload_json, status, available_at)
     VALUES ((SELECT id FROM users WHERE uid = $1), $2, $3, $4::jsonb, 'pending', now())`,
    [uid, reorgEventKey, repairReorgTx.id, JSON.stringify(repairReorgTx)],
  );
  const [reorgRepairResult, reorgWorkerResult] = await Promise.all([
    backfillHistoricalWalletJournal(uid),
    drainWalletJournalOutbox(uid, 10),
  ]);
  assert.equal(reorgWorkerResult.failed, 0, 'Live reorg outbox processing must not fail during historical repair.');
  assert.equal(reorgRepairResult.skipped, 0,
    'The reorg repair fixture is eligible for reversal; the pending fixture is inserted and checked below.');
  const repairReversalRows = await pool.query(
    `SELECT id::text, reversal_of::text FROM journal_entries
      WHERE user_id = (SELECT id FROM users WHERE uid = $1)
        AND reversal_of = $2 AND status = 'posted'`,
    [uid, repairJournalRows.rows[0].id],
  );
  assert.equal(repairReversalRows.rowCount, 1,
    'Historical repair and live reorg delivery must create exactly one reversal for the confirmation.');

  // Pending/unverified historical records are deliberately excluded from repair.
  const pendingRef = `pending-repair-${suffix}`;
  await pool.query(
    `INSERT INTO ledger_transactions
      (user_id, tx_ref, timestamp, tx_type, asset, network, amount, fee, counterparty,
       status, note, is_verified_on_chain)
     VALUES ((SELECT id FROM users WHERE uid = $1), $2, $3, 'incoming', 'BTC',
       'Bitcoin Mainnet', 0.003, 0, 'unverified-fixture', 'pending_approval',
       'must never be credited by backfill', false)`,
    [uid, pendingRef, new Date().toISOString()],
  );
  const pendingRepair = await backfillHistoricalWalletJournal(uid);
  assert.equal(pendingRepair.skipped, 1, 'Pending/unverified records must be skipped.');
  const pendingJournalRows = await pool.query(
    'SELECT id FROM journal_entries WHERE user_id = (SELECT id FROM users WHERE uid = $1) AND idempotency_key LIKE $2',
    [uid, `wallet-tx:${pendingRef}:%`],
  );
  assert.equal(pendingJournalRows.rowCount, 0, 'Pending/unverified records must never create journal credits.');

});
