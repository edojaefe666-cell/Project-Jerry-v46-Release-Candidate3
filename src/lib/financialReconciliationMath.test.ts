import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateLegacyWalletSatoshis, mapLegacyWalletTransactionRows } from './financialReconciliationMath.ts';

test('maps PostgreSQL snake_case wallet rows before calculating legacy BTC balance', () => {
  const rows = mapLegacyWalletTransactionRows([
    { tx_type: 'incoming', amount: 0.25, fee: 0, status: 'confirmed', is_verified_on_chain: true },
    { tx_type: 'outgoing', amount: 0.05, fee: 0.001, status: 'confirmed', is_verified_on_chain: true },
    { tx_type: 'incoming', amount: 0.5, fee: 0, status: 'pending_approval', is_verified_on_chain: true },
    { tx_type: 'incoming', amount: 0.75, fee: 0, status: 'confirmed', is_verified_on_chain: false },
  ]);

  assert.equal(calculateLegacyWalletSatoshis(rows), '19900000');
});

test('treats null legacy fees as zero and rejects invalid numeric data', () => {
  const rows = mapLegacyWalletTransactionRows([
    { tx_type: 'incoming', amount: '0.00000001', fee: null, status: 'confirmed', is_verified_on_chain: true },
  ]);
  assert.equal(calculateLegacyWalletSatoshis(rows), '1');
  assert.throws(() => mapLegacyWalletTransactionRows([
    { tx_type: 'incoming', amount: 'not-a-number', fee: 0, status: 'confirmed', is_verified_on_chain: true },
  ]), /invalid BTC amount or fee/);
});
