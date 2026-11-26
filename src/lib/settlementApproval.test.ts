import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSettlementApprovalStatus } from './settlementApproval.ts';
import type { WalletTransaction } from './types.ts';

const verifiedSettlement = (overrides: Partial<WalletTransaction> = {}): WalletTransaction => ({
  id: 'settlement-1',
  timestamp: '2026-11-26T10:00:00.000Z',
  type: 'business_revenue',
  asset: 'BTC',
  network: 'Bitcoin Mainnet',
  amount: 0.25,
  fee: 0,
  counterparty: 'bc1qexample',
  status: 'pending_approval',
  note: 'Verified incoming payment',
  txHash: 'a'.repeat(64),
  isVerifiedOnChain: true,
  settlementMode: 'on_chain',
  confirmationDepth: 6,
  verifiedBlockHeight: 900000,
  verifiedBlockHash: 'b'.repeat(64),
  approvalId: 'approval-1',
  ...overrides,
});

test('approved settlement becomes confirmed only with complete finality evidence', () => {
  assert.equal(resolveSettlementApprovalStatus(verifiedSettlement(), 'approved'), 'confirmed');
});

test('approval without six confirmations cannot create wallet credit', () => {
  assert.equal(resolveSettlementApprovalStatus(verifiedSettlement({ confirmationDepth: 5 }), 'approved'), 'pending_approval');
});

test('approval without verified block or transaction evidence cannot create wallet credit', () => {
  assert.equal(resolveSettlementApprovalStatus(verifiedSettlement({ verifiedBlockHash: undefined }), 'approved'), 'pending_approval');
  assert.equal(resolveSettlementApprovalStatus(verifiedSettlement({ txHash: undefined }), 'approved'), 'pending_approval');
  assert.equal(resolveSettlementApprovalStatus(verifiedSettlement({ isVerifiedOnChain: false }), 'approved'), 'pending_approval');
});

test('approval for non-mainnet or non-BTC settlement cannot create wallet credit', () => {
  assert.equal(resolveSettlementApprovalStatus(verifiedSettlement({ network: 'Bitcoin Testnet' }), 'approved'), 'pending_approval');
  assert.equal(resolveSettlementApprovalStatus(verifiedSettlement({ asset: 'ETH' as unknown as 'BTC' }), 'approved'), 'pending_approval');
});

test('rejection always rejects the settlement and existing terminal states are preserved on approval', () => {
  assert.equal(resolveSettlementApprovalStatus(verifiedSettlement(), 'rejected'), 'rejected');
  assert.equal(resolveSettlementApprovalStatus(verifiedSettlement({ status: 'rejected' }), 'approved'), 'rejected');
});
