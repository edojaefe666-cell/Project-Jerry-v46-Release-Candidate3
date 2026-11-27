import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateProviderCostMicroUsd, reserveProviderCost, settleProviderCost } from './providerCostStore.ts';

test('estimates provider cost using integer micro-USD rates and rounds each token class upward', () => {
  assert.equal(estimateProviderCostMicroUsd(1_000_000, 2_000_000, {
    inputMicroUsdPerMillionTokens: 2_000_000,
    outputMicroUsdPerMillionTokens: 8_000_000,
  }), 18_000_000);
  assert.equal(estimateProviderCostMicroUsd(1, 1, {
    inputMicroUsdPerMillionTokens: 1,
    outputMicroUsdPerMillionTokens: 1,
  }), 2);
});

test('provider USD cost reservation uses one atomic owner/day ceiling upsert', async () => {
  let statement = '';
  let values: unknown[] | undefined;
  const reservation = await reserveProviderCost({
    ownerUid: 'owner-1', reserveMicroUsd: 250_000, dailyLimitMicroUsd: 1_000_000,
  }, { query: async (sql: string, params?: unknown[]) => {
    statement = sql; values = params; return { rows: [{ day: '2026-11-27' }], rowCount: 1 };
  } } as never);
  assert.equal(reservation.reservedMicroUsd, 250_000);
  assert.match(statement, /ON CONFLICT\(owner_uid,usage_day\) DO UPDATE/);
  assert.match(statement, /reserved_micro_usd \+ jerry_provider_daily_cost\.actual_micro_usd/);
  assert.deepEqual(values, ['owner-1', 1_000_000, 250_000]);
});

test('provider USD cost ceiling fails closed on atomic reservation rejection', async () => {
  await assert.rejects(() => reserveProviderCost({
    ownerUid: 'owner-1', reserveMicroUsd: 250_000, dailyLimitMicroUsd: 1_000_000,
  }, { query: async () => ({ rows: [], rowCount: 0 }) } as never), /cost ceiling reached/i);
});

test('successful provider cost reconciliation atomically replaces reservation with actual cost', async () => {
  let statement = '';
  let values: unknown[] | undefined;
  await settleProviderCost({
    ownerUid: 'owner-1', day: '2026-11-27', reservedMicroUsd: 250_000, dailyLimitMicroUsd: 1_000_000,
  }, 125_000, { query: async (sql: string, params?: unknown[]) => {
    statement = sql; values = params; return { rows: [], rowCount: 1 };
  } } as never);
  assert.match(statement, /reserved_micro_usd=GREATEST\(0,reserved_micro_usd-\$4\)/);
  assert.match(statement, /actual_micro_usd=actual_micro_usd\+\$5/);
  assert.equal(values?.[4], 125_000);
});

test('missing or over-reservation actual cost never releases reserved funds', async () => {
  let called = false;
  await settleProviderCost({
    ownerUid: 'owner-1', day: '2026-11-27', reservedMicroUsd: 10, dailyLimitMicroUsd: 100,
  }, 11, { query: async () => { called = true; return { rows: [], rowCount: 1 }; } } as never);
  assert.equal(called, false);
});
