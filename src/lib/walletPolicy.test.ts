import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_JERRY_STATE } from './seedData.ts';
import { formatUsd, normalizeJerryWalletState } from './walletPolicy.ts';

test('USD is the canonical fiat display currency', () => {
  assert.equal(formatUsd(1234.5), '$1,234.50');
});

test('wallet normalization keeps only native Bitcoin mainnet financial records', () => {
  const normalized = normalizeJerryWalletState(INITIAL_JERRY_STATE);
  assert.ok(normalized.walletAssets.every((asset) => asset.symbol === 'BTC' && asset.network === 'Bitcoin Mainnet'));
  assert.ok(normalized.transactions.every((tx) => tx.asset === 'BTC' && tx.network === 'Bitcoin Mainnet'));
  assert.ok(normalized.externalWallets.every((wallet) => wallet.connected === false));
});
