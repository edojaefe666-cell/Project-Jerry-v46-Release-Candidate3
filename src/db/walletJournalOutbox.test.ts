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
  assert.equal(isEligibleWalletJournalEvent(transaction({ status: 'pending' })), false);
  assert.equal(isEligibleWalletJournalEvent(transaction({ isVerifiedOnChain: false })), false);
});

test('ineligible: non-Bitcoin assets and non-mainnet networks', () => {
  assert.equal(isEligibleWalletJournalEvent(transaction({ asset: 'ETH' })), false);
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
