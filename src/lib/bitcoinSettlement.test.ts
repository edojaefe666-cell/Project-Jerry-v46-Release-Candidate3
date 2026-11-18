import test from 'node:test';
import assert from 'node:assert/strict';
import { validateIncomingBitcoinPayment } from './bitcoinSettlement.ts';

const hash = 'a'.repeat(64);
const address = 'bc1qexampleconfiguredaddress';
const base = {
  txHash: hash,
  amountBtc: 0.001,
  receivingAddresses: [address],
  transaction: { txid: hash, vout: [{ scriptpubkey_address: address, value: 100000 }] },
};

test('accepts only the exact BTC amount paid to a configured workspace address', () => {
  assert.deepEqual(validateIncomingBitcoinPayment(base), { valid: true, receivedSatoshis: 100000 });
});

test('rejects a confirmed transaction paying an unrelated address', () => {
  const result = validateIncomingBitcoinPayment({ ...base, transaction: { ...base.transaction, vout: [{ scriptpubkey_address: 'bc1qattacker', value: 100000 }] } });
  assert.equal(result.valid, false);
  assert.match(result.reason ?? '', /pays 0 satoshis/);
});

test('rejects amount inflation and transaction-hash substitution', () => {
  assert.equal(validateIncomingBitcoinPayment({ ...base, amountBtc: 0.002 }).valid, false);
  assert.equal(validateIncomingBitcoinPayment({ ...base, txHash: 'b'.repeat(64) }).valid, false);
});

test('rejects missing receiving addresses and malformed output values', () => {
  assert.equal(validateIncomingBitcoinPayment({ ...base, receivingAddresses: [] }).valid, false);
  assert.equal(validateIncomingBitcoinPayment({ ...base, transaction: { ...base.transaction, vout: [{ scriptpubkey_address: address, value: 1.5 }] } }).valid, false);
});
