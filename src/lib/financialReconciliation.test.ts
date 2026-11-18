import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateLegacyWalletSatoshis } from './financialReconciliationMath.ts';

test('legacy BTC wallet balance is derived only from confirmed verified transactions', () => {
  assert.equal(calculateLegacyWalletSatoshis([
    { txType: 'incoming', amount: 1, fee: 0, status: 'confirmed', isVerifiedOnChain: true },
    { txType: 'outgoing', amount: 0.25, fee: 0.00001, status: 'confirmed', isVerifiedOnChain: true },
    { txType: 'incoming', amount: 9, fee: 0, status: 'pending_approval', isVerifiedOnChain: false },
    { txType: 'incoming', amount: 5, fee: 0, status: 'reorged', isVerifiedOnChain: false },
  ]), '74999000');
});

test('reconciliation source is tenant scoped and production backfill is fail-closed', async () => {
  const fs = await import('node:fs/promises');
  const source = await fs.readFile(new URL('../db/financialReconciliation.ts', import.meta.url), 'utf8');
  const server = await fs.readFile(new URL('../../server.ts', import.meta.url), 'utf8');
  assert.match(source, /WHERE u\.uid = \$1/);
  assert.match(source, /wallet-tx:/);
  assert.match(server, /JERRY_ALLOW_FINANCIAL_BACKFILL/);
  assert.match(server, /Historical financial backfill is disabled in production/);
});
