import test from 'node:test';
import assert from 'node:assert/strict';
import { reverseJournalLines, validateJournalLines } from './doubleEntryJournal.ts';

test('accepts balanced multi-line postings using integer atomic units', () => {
  const lines = validateJournalLines([
    { accountCode: 'cash:btc', asset: 'BTC', debitUnits: '125000', creditUnits: '0' },
    { accountCode: 'revenue:btc', asset: 'BTC', debitUnits: '0', creditUnits: '125000' },
  ]);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].debitUnits, '125000');
});

test('rejects unbalanced postings per asset, including cross-asset netting', () => {
  assert.throws(() => validateJournalLines([
    { accountCode: 'cash:btc', asset: 'BTC', debitUnits: '100', creditUnits: '0' },
    { accountCode: 'revenue:btc', asset: 'BTC', debitUnits: '0', creditUnits: '99' },
  ]), /unbalanced for BTC/);
  assert.throws(() => validateJournalLines([
    { accountCode: 'cash:btc', asset: 'BTC', debitUnits: '100', creditUnits: '0' },
    { accountCode: 'cash:usd', asset: 'USD', debitUnits: '0', creditUnits: '100' },
  ]), /unbalanced/);
});

test('rejects zero-sided, double-sided, negative, fractional and unsafe float-like amounts', () => {
  const base = { accountCode: 'cash:btc', asset: 'BTC' };
  assert.throws(() => validateJournalLines([base, { ...base, accountCode: 'equity:btc', creditUnits: '1' }]), /exactly one/);
  assert.throws(() => validateJournalLines([{ ...base, debitUnits: '1', creditUnits: '1' }, { ...base, accountCode: 'equity:btc', creditUnits: '2' }]), /exactly one/);
  assert.throws(() => validateJournalLines([{ ...base, debitUnits: '-1' }, { ...base, accountCode: 'equity:btc', creditUnits: '1' }]), /integer atomic/);
  assert.throws(() => validateJournalLines([{ ...base, debitUnits: '1.5' }, { ...base, accountCode: 'equity:btc', creditUnits: '1.5' }]), /integer atomic/);
});

test('reversal swaps debit and credit without mutating original lines', () => {
  const original = validateJournalLines([
    { accountCode: 'cash:btc', asset: 'BTC', debitUnits: '700', creditUnits: '0' },
    { accountCode: 'equity:btc', asset: 'BTC', debitUnits: '0', creditUnits: '700' },
  ]);
  const reversed = reverseJournalLines(original);
  assert.equal(reversed[0].debitUnits, '0');
  assert.equal(reversed[0].creditUnits, '700');
  assert.equal(original[0].debitUnits, '700');
  assert.equal(validateJournalLines(reversed).length, 2);
});
