import test from 'node:test';
import assert from 'node:assert/strict';
import { auditWalletJournalEntries, parseWalletJournalEntryKey } from './financialReconciliation.ts';

test('parses legacy confirmed wallet journal keys', () => {
  assert.deepEqual(parseWalletJournalEntryKey('wallet-tx:tx-123:confirmed'), {
    transactionRef: 'tx-123',
    event: 'confirmed',
  });
});

test('parses cycle-aware confirmed wallet journal keys', () => {
  assert.deepEqual(parseWalletJournalEntryKey(`wallet-tx:tx-123:confirmed:cycle-2:block-${'a'.repeat(64)}`), {
    transactionRef: 'tx-123',
    event: 'confirmed',
  });
});

test('parses cycle-aware reorg reversal keys', () => {
  assert.deepEqual(parseWalletJournalEntryKey(`wallet-tx:tx-123:reorg-reversal:cycle-2:block-${'b'.repeat(64)}`), {
    transactionRef: 'tx-123',
    event: 'reorg-reversal',
  });
});

test('rejects unrelated and malformed journal keys', () => {
  assert.equal(parseWalletJournalEntryKey('other:tx-123:confirmed'), null);
  assert.equal(parseWalletJournalEntryKey('wallet-tx:tx-123:pending'), null);
  assert.equal(parseWalletJournalEntryKey('wallet-tx::confirmed'), null);
});


test('audits exact confirmation generations and matched reversal targets', () => {
  const rows = [
    { id: '10', idempotency_key: 'wallet-tx:tx-123:confirmed:cycle-2:block-abc', reversal_of: null, status: 'posted' },
    { id: '11', idempotency_key: 'wallet-tx:tx-123:reorg-reversal:cycle-2:block-abc', reversal_of: '10', status: 'posted' },
  ];
  const audit = auditWalletJournalEntries(rows);
  assert.deepEqual(audit.duplicateConfirmedGenerations, []);
  assert.deepEqual(audit.unmatchedReversalEntries, []);
  assert.deepEqual([...audit.reversedOriginalEntryIds], ['10']);
});

test('flags orphan and cross-transaction reversal targets', () => {
  const rows = [
    { id: '20', idempotency_key: 'wallet-tx:tx-a:confirmed:cycle-0:block-a', reversal_of: null, status: 'posted' },
    { id: '21', idempotency_key: 'wallet-tx:tx-a:reorg-reversal:cycle-0:block-a', reversal_of: 'missing', status: 'posted' },
    { id: '22', idempotency_key: 'wallet-tx:tx-b:confirmed:cycle-0:block-b', reversal_of: null, status: 'posted' },
    { id: '23', idempotency_key: 'wallet-tx:tx-a:reorg-reversal:cycle-0:block-a', reversal_of: '22', status: 'posted' },
  ];
  const audit = auditWalletJournalEntries(rows);
  assert.deepEqual(audit.unmatchedReversalEntries.sort(), ['21', '23']);
  assert.deepEqual([...audit.reversedOriginalEntryIds], []);
});

test('flags reversal aimed at the wrong confirmation generation', () => {
  const rows = [
    { id: '30', idempotency_key: 'wallet-tx:tx-9:confirmed:cycle-1:block-old', reversal_of: null, status: 'posted' },
    { id: '31', idempotency_key: 'wallet-tx:tx-9:confirmed:cycle-2:block-new', reversal_of: null, status: 'posted' },
    { id: '32', idempotency_key: 'wallet-tx:tx-9:reorg-reversal:cycle-2:block-new', reversal_of: '30', status: 'posted' },
  ];
  const audit = auditWalletJournalEntries(rows);
  assert.deepEqual(audit.unmatchedReversalEntries, ['32']);
});

test('detects duplicate postings for one confirmation generation', () => {
  const key = 'wallet-tx:tx-duplicate:confirmed:cycle-3:block-same';
  const audit = auditWalletJournalEntries([
    { id: '40', idempotency_key: key, reversal_of: null, status: 'posted' },
    { id: '41', idempotency_key: key, reversal_of: null, status: 'posted' },
  ]);
  assert.deepEqual(audit.duplicateConfirmedGenerations, ['tx-duplicate:cycle-3:block-same']);
});

test('ignores drafts and unrelated journal entries during integrity audit', () => {
  const audit = auditWalletJournalEntries([
    { id: '50', idempotency_key: 'wallet-tx:tx-draft:confirmed', reversal_of: null, status: 'draft' },
    { id: '51', idempotency_key: 'unrelated:entry', reversal_of: null, status: 'posted' },
  ]);
  assert.equal(audit.confirmedEntriesByTransaction.size, 0);
  assert.deepEqual(audit.unmatchedReversalEntries, []);
});


test('journal audit detects duplicate confirmation generations', () => {
  const suffix = `:confirmed:cycle-2:block-${'a'.repeat(64)}`;
  const audit = auditWalletJournalEntries([
    { id: '10', idempotency_key: `wallet-tx:tx-dup${suffix}`, reversal_of: null, status: 'posted' },
    { id: '11', idempotency_key: `wallet-tx:tx-dup${suffix}`, reversal_of: null, status: 'posted' },
  ]);
  assert.deepEqual(audit.duplicateConfirmedGenerations, [`tx-dup:cycle-2:block-${'a'.repeat(64)}`]);
});

test('journal audit rejects orphan and wrong-generation reversals', () => {
  const blockA = 'a'.repeat(64);
  const blockB = 'b'.repeat(64);
  const audit = auditWalletJournalEntries([
    { id: '20', idempotency_key: `wallet-tx:tx-a:confirmed:cycle-0:block-${blockA}`, reversal_of: null, status: 'posted' },
    { id: '21', idempotency_key: `wallet-tx:tx-a:reorg-reversal:cycle-1:block-${blockB}`, reversal_of: '20', status: 'posted' },
    { id: '22', idempotency_key: 'wallet-tx:tx-missing:reorg-reversal:cycle-0:block-x', reversal_of: '999', status: 'posted' },
  ]);
  assert.deepEqual(audit.unmatchedReversalEntries, ['21', '22']);
  assert.equal(audit.reversedOriginalEntryIds.size, 0);
});

test('journal audit accepts a reversal bound to the exact confirmation generation', () => {
  const block = 'c'.repeat(64);
  const audit = auditWalletJournalEntries([
    { id: '30', idempotency_key: `wallet-tx:tx-ok:confirmed:cycle-3:block-${block}`, reversal_of: null, status: 'posted' },
    { id: '31', idempotency_key: `wallet-tx:tx-ok:reorg-reversal:cycle-3:block-${block}`, reversal_of: '30', status: 'posted' },
  ]);
  assert.deepEqual(audit.unmatchedReversalEntries, []);
  assert.deepEqual([...audit.reversedOriginalEntryIds], ['30']);
});


test('legacy backfill reversal must name the exact original journal entry', () => {
  const rows = [
    { id: '60', idempotency_key: 'wallet-tx:tx-legacy:confirmed', reversal_of: null, status: 'posted' },
    { id: '61', idempotency_key: 'wallet-tx:tx-legacy:reorg-reversal:entry-60', reversal_of: '60', status: 'posted' },
  ];
  const audit = auditWalletJournalEntries(rows);
  assert.deepEqual(audit.unmatchedReversalEntries, []);
  assert.deepEqual([...audit.reversedOriginalEntryIds], ['60']);
});

test('legacy reversal key pointing to another confirmation is flagged', () => {
  const rows = [
    { id: '70', idempotency_key: 'wallet-tx:tx-legacy:confirmed', reversal_of: null, status: 'posted' },
    { id: '71', idempotency_key: 'wallet-tx:tx-legacy:reorg-reversal:entry-999', reversal_of: '70', status: 'posted' },
  ];
  const audit = auditWalletJournalEntries(rows);
  assert.deepEqual(audit.unmatchedReversalEntries, ['71']);
  assert.equal(audit.reversedOriginalEntryIds.size, 0);
});


test('journal audit flags multiple posted reversals targeting the same confirmation', () => {
  const rows = [
    { id: '80', idempotency_key: 'wallet-tx:tx-double-reversal:confirmed', reversal_of: null, status: 'posted' },
    { id: '81', idempotency_key: 'wallet-tx:tx-double-reversal:reorg-reversal:entry-80', reversal_of: '80', status: 'posted' },
    { id: '82', idempotency_key: 'wallet-tx:tx-double-reversal:reorg-reversal:entry-80', reversal_of: '80', status: 'posted' },
  ];
  const audit = auditWalletJournalEntries(rows);
  assert.deepEqual(audit.unmatchedReversalEntries, []);
  assert.deepEqual(audit.duplicateReversalTargets, ['80']);
  assert.deepEqual([...audit.reversedOriginalEntryIds], ['80']);
});
