import test from 'node:test';
import assert from 'node:assert/strict';
import { getWalletJournalEventKey, isEligibleWalletJournalEvent } from '../lib/walletJournalPolicy.ts';
import type { WalletTransaction } from '../lib/types.ts';

const transaction = (overrides: Partial<WalletTransaction> = {}): WalletTransaction => ({
  id: 'tx-1',
  timestamp: '2026-11-26T10:00:00.000Z',
  type: 'incoming',
  asset: 'BTC',
  network: 'Bitcoin Mainnet',
  amount: 0.25,
  fee: 0,
  counterparty: 'test-counterparty',
  status: 'confirmed',
  note: 'verified settlement',
  isVerifiedOnChain: true,
  ...overrides,
});

test('eligible: confirmed Bitcoin mainnet transaction with independent on-chain verification', () => {
  assert.equal(isEligibleWalletJournalEvent(transaction()), true);
});

test('eligible: reorged Bitcoin mainnet transaction queues reversal handling', () => {
  assert.equal(isEligibleWalletJournalEvent(transaction({ status: 'reorged', isVerifiedOnChain: false })), true);
});

test('ineligible: pending or unverified confirmed Bitcoin transaction', () => {
  assert.equal(isEligibleWalletJournalEvent(transaction({ status: 'pending_approval' })), false);
  assert.equal(isEligibleWalletJournalEvent(transaction({ isVerifiedOnChain: false })), false);
});

test('ineligible: non-Bitcoin assets and non-mainnet networks', () => {
  assert.equal(isEligibleWalletJournalEvent(transaction({ asset: 'ETH' as unknown as 'BTC' })), false);
  assert.equal(isEligibleWalletJournalEvent(transaction({ network: 'Bitcoin Testnet' })), false);
});

test('journal event identity changes across block generations and reorg cycles', () => {
  const firstConfirmation = transaction({ verifiedBlockHash: 'a'.repeat(64), journalCycle: 0 });
  const firstReorg = transaction({ status: 'reorged', isVerifiedOnChain: false, verifiedBlockHash: 'a'.repeat(64), journalCycle: 0 });
  const secondConfirmation = transaction({ verifiedBlockHash: 'b'.repeat(64), journalCycle: 1 });
  const repeatedBlockAfterReorg = transaction({ verifiedBlockHash: 'a'.repeat(64), journalCycle: 1 });
  assert.notEqual(getWalletJournalEventKey(firstConfirmation), getWalletJournalEventKey(secondConfirmation));
  assert.notEqual(getWalletJournalEventKey(firstConfirmation), getWalletJournalEventKey(repeatedBlockAfterReorg));
  assert.notEqual(getWalletJournalEventKey(firstReorg), getWalletJournalEventKey(firstConfirmation));
  assert.notEqual(getWalletJournalEventKey(firstConfirmation), getWalletJournalEventKey(transaction({ verifiedBlockHash: 'a'.repeat(64), journalCycle: 1 })));
});


test('PostgreSQL outbox workers claim each event once and recover stale processing rows', {
  skip: process.env.JERRY_JOURNAL_TEST_DATABASE !== '1'
    ? 'Set JERRY_JOURNAL_TEST_DATABASE=1 for a disposable PostgreSQL database.'
    : false,
}, async () => {
  assert.notEqual(process.env.NODE_ENV, 'production');
  assert.ok(process.env.SQL_HOST && process.env.SQL_USER && /test|tenant/i.test(process.env.SQL_DB_NAME ?? ''),
    'Outbox integration requires a disposable PostgreSQL database name containing test/tenant.');

  const { createPool } = await import('../db/index.ts');
  const { getOrCreateUser } = await import('../db/users.ts');
  const { drainWalletJournalOutbox } = await import('../db/walletJournalOutbox.ts');
  const { randomUUID } = await import('node:crypto');
  const pool = createPool();
  const suffix = randomUUID();
  const uid = `outbox-test-${suffix}`;
  const user = await getOrCreateUser(uid, `outbox-${suffix}@example.invalid`);
  const makeTransaction = (id: string, block: string): WalletTransaction => ({
    id,
    timestamp: new Date().toISOString(),
    type: 'incoming',
    asset: 'BTC',
    network: 'Bitcoin Mainnet',
    amount: 0.001,
    fee: 0,
    counterparty: 'disposable-outbox-integration-test',
    status: 'confirmed',
    note: 'verified outbox integration fixture',
    isVerifiedOnChain: true,
    confirmationDepth: 6,
    verifiedBlockHeight: 900000,
    verifiedBlockHash: block.repeat(64),
    journalCycle: 0,
  });

  const concurrentTx = makeTransaction(`concurrent-${suffix}`, 'a');
  const staleTx = makeTransaction(`stale-${suffix}`, 'b');
  const duplicateDeliveryTx = makeTransaction(`duplicate-delivery-${suffix}`, 'c');
  const { getWalletJournalEventKey } = await import('../lib/walletJournalPolicy.ts');
  const insertOutbox = async (tx: WalletTransaction, status: 'pending' | 'processing') => {
    await pool.query(
      `INSERT INTO wallet_journal_outbox
        (user_id, event_key, tx_ref, payload_json, status, available_at, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, now() - interval '10 minutes', 
         CASE WHEN $5 = 'processing' THEN now() - interval '10 minutes' ELSE now() END)
       ON CONFLICT (user_id, event_key) DO NOTHING`,
      [user.id, getWalletJournalEventKey(tx), tx.id, JSON.stringify(tx), status],
    );
  };

  await insertOutbox(concurrentTx, 'pending');
  await insertOutbox(staleTx, 'processing');
  // Simulate the same confirmed settlement being delivered twice through
  // distinct outbox event identities (e.g. replay from a repaired producer).
  await insertOutbox(duplicateDeliveryTx, 'pending');
  await pool.query(
    `INSERT INTO wallet_journal_outbox
      (user_id, event_key, tx_ref, payload_json, status, available_at)
     VALUES ($1, $2, $3, $4::jsonb, 'pending', now() - interval '10 minutes')
     ON CONFLICT (user_id, event_key) DO NOTHING`,
    [user.id, `duplicate-delivery-replay:${suffix}`, duplicateDeliveryTx.id, JSON.stringify(duplicateDeliveryTx)],
  );

  // SKIP LOCKED workers may legitimately return no work while another
  // worker owns the only eligible row in its claim window. Run bounded waves
  // until all four rows have been claimed instead of assuming one wave drains
  // more rows than its workers actually acquired.
  let totalProcessed = 0;
  for (let wave = 0; wave < 8 && totalProcessed < 4; wave++) {
    const concurrentDrains = await Promise.all(
      Array.from({ length: 8 }, () => drainWalletJournalOutbox(uid, 1)),
    );
    totalProcessed += concurrentDrains.reduce((sum, result) => sum + result.processed, 0);
  }
  assert.equal(totalProcessed, 4,
    'Concurrent workers must eventually process pending, stale, and duplicate-delivery events.');

  const eventKeys = [getWalletJournalEventKey(concurrentTx), getWalletJournalEventKey(staleTx), getWalletJournalEventKey(duplicateDeliveryTx), `duplicate-delivery-replay:${suffix}`];
  const outboxRows = await pool.query(
    'SELECT event_key, status, attempts FROM wallet_journal_outbox WHERE user_id = $1 AND event_key = ANY($2::text[])',
    [user.id, eventKeys],
  );
  assert.equal(outboxRows.rowCount, 4);
  assert.ok(outboxRows.rows.every((row) => row.status === 'processed'));
  assert.ok(outboxRows.rows.every((row) => row.attempts >= 1));

  const journalRows = await pool.query(
    'SELECT idempotency_key FROM journal_entries WHERE user_id = $1 AND idempotency_key = ANY($2::text[]) AND status = \'posted\'',
    [user.id, eventKeys],
  );
  assert.equal(journalRows.rowCount, 3, 'Duplicate delivery must produce only one posted journal entry for the same settlement.');
});
