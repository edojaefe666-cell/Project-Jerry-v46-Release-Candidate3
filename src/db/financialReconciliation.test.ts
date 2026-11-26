import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWalletJournalEntryKey } from './financialReconciliation.ts';

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
