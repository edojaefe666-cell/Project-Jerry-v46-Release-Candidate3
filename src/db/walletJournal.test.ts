import test from 'node:test';
import assert from 'node:assert/strict';
import { btcToSatoshis } from '../lib/btcUnits.ts';

test('wallet journal converts BTC to exact satoshi atomic units', () => {
  assert.equal(btcToSatoshis(0.00000001), '1');
  assert.equal(btcToSatoshis(1.23456789), '123456789');
  assert.equal(btcToSatoshis(0), '0');
});

test('wallet journal rejects invalid BTC values', () => {
  for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY, 21_000_001]) {
    assert.throws(() => btcToSatoshis(value), /invalid BTC amount/i);
  }
});

import { buildWalletJournalLines } from '../lib/btcUnits.ts';

test('incoming settlement journals wallet asset against BTC settlement income', () => {
  assert.deepEqual(buildWalletJournalLines('incoming', '125000000', '0'), [
    { accountCode: 'asset:btc:wallet', asset: 'BTC', debitUnits: '125000000', creditUnits: '0' },
    { accountCode: 'income:btc:settlement', asset: 'BTC', debitUnits: '0', creditUnits: '125000000' },
  ]);
});

test('outgoing transfer journals principal and network fee separately', () => {
  assert.deepEqual(buildWalletJournalLines('outgoing', '100000000', '1000'), [
    { accountCode: 'asset:btc:transfer-clearing', asset: 'BTC', debitUnits: '100000000', creditUnits: '0' },
    { accountCode: 'asset:btc:wallet', asset: 'BTC', debitUnits: '0', creditUnits: '100000000' },
    { accountCode: 'expense:btc:network-fee', asset: 'BTC', debitUnits: '1000', creditUnits: '0' },
    { accountCode: 'asset:btc:wallet', asset: 'BTC', debitUnits: '0', creditUnits: '1000' },
  ]);
});

test('wallet journal rejects BTC values with more than eight decimal places', () => {
  assert.throws(() => btcToSatoshis(0.000000001), /at most eight decimal places/i);
});
