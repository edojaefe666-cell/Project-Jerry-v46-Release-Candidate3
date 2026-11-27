import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateProviderCostMicroUsd, reserveProviderCost, settleProviderCost } from './providerCostStore.ts';

test('estimates provider cost using integer micro-USD rates and rounds each token class upward', () => {
  assert.equal(estimateProviderCostMicroUsd(1_000_000, 2_000_000, {
    inputMicroUsdPerMillionTokens: 2_000_000, outputMicroUsdPerMillionTokens: 8_000_000,
  }), 18_000_000);
  assert.equal(estimateProviderCostMicroUsd(1, 1, {
    inputMicroUsdPerMillionTokens: 1, outputMicroUsdPerMillionTokens: 1,
  }), 2);
});

test('provider USD cost reservation atomically records a unique settlement identity', async () => {
  let statement = '';
  let values: unknown[] | undefined;
  const reservation = await reserveProviderCost({
    ownerUid: 'owner-1', reserveMicroUsd: 250_000, dailyLimitMicroUsd: 1_000_000,
  }, { query: async (sql: string, params?: unknown[]) => {
    statement = sql; values = params;
    return { rows: [{ reservation_id: params?.[3], day: '2026-11-27' }], rowCount: 1 };
  } } as never);
  assert.equal(reservation.reservedMicroUsd, 250_000);
  assert.ok(reservation.reservationId);
  assert.match(statement, /ON CONFLICT\(owner_uid,usage_day\) DO UPDATE/);
  assert.match(statement, /INSERT INTO jerry_provider_cost_reservations/);
  assert.match(statement, /SELECT \$4,\$1,usage_day,\$2,\$3,'reserved' FROM budget/);
  assert.deepEqual(values?.slice(0, 3), ['owner-1', 1_000_000, 250_000]);
});

test('provider USD cost ceiling fails closed on atomic reservation rejection', async () => {
  await assert.rejects(() => reserveProviderCost({
    ownerUid: 'owner-1', reserveMicroUsd: 250_000, dailyLimitMicroUsd: 1_000_000,
  }, { query: async () => ({ rows: [], rowCount: 0 }) } as never), /cost ceiling reached/i);
});

test('successful provider cost reconciliation claims a reservation exactly once', async () => {
  let statement = '';
  let values: unknown[] | undefined;
  const reservation = {
    reservationId: 'reservation-1', ownerUid: 'owner-1', day: '2026-11-27',
    reservedMicroUsd: 250_000, dailyLimitMicroUsd: 1_000_000,
  };
  await settleProviderCost(reservation, 125_000, { query: async (sql: string, params?: unknown[]) => {
    statement = sql; values = params; return { rows: [{ owner_uid: 'owner-1' }], rowCount: 1 };
  } } as never);
  assert.match(statement, /status='settled'/);
  assert.match(statement, /status='reserved'/);
  assert.match(statement, /UPDATE jerry_provider_daily_cost AS daily/);
  assert.equal(values?.[0], 'reservation-1');
  assert.equal(values?.[5], 125_000);
});

test('duplicate settlement is rejected without decrementing another reservation', async () => {
  const reservation = {
    reservationId: 'reservation-already-settled', ownerUid: 'owner-1', day: '2026-11-27',
    reservedMicroUsd: 10, dailyLimitMicroUsd: 100,
  };
  await assert.rejects(() => settleProviderCost(reservation, 5, {
    query: async () => ({ rows: [], rowCount: 0 }),
  } as never), /already applied/i);
});

test('missing or over-reservation actual cost never releases reserved funds', async () => {
  let called = false;
  await settleProviderCost({
    reservationId: 'reservation-1', ownerUid: 'owner-1', day: '2026-11-27',
    reservedMicroUsd: 10, dailyLimitMicroUsd: 100,
  }, 11, { query: async () => { called = true; return { rows: [], rowCount: 1 }; } } as never);
  assert.equal(called, false);
});


test('PostgreSQL provider USD reservations enforce concurrent ceilings and exactly-once settlement', {
  skip: process.env.JERRY_PROVIDER_LEDGER_TEST_DATABASE !== '1'
    ? 'Set JERRY_PROVIDER_LEDGER_TEST_DATABASE=1 for a disposable PostgreSQL database.'
    : false,
}, async () => {
  assert.notEqual(process.env.NODE_ENV, 'production');
  assert.ok(process.env.SQL_HOST && process.env.SQL_USER && /test|tenant/i.test(process.env.SQL_DB_NAME ?? ''),
    'Provider ledger integration requires a disposable PostgreSQL database name containing test/tenant.');
  const { createPool } = await import('./index.ts');
  const { randomUUID } = await import('node:crypto');
  const pool = createPool();
  const ownerUid = 'provider-cost-integration-' + randomUUID();
  try {
    const attempts = await Promise.allSettled([
      reserveProviderCost({ ownerUid, reserveMicroUsd: 60, dailyLimitMicroUsd: 100 }),
      reserveProviderCost({ ownerUid, reserveMicroUsd: 60, dailyLimitMicroUsd: 100 }),
    ]);
    const accepted = attempts.filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof reserveProviderCost>>> => result.status === 'fulfilled');
    assert.equal(accepted.length, 1, 'only one concurrent reservation may fit under the daily cost ceiling');
    const reservation = accepted[0].value;
    const settlements = await Promise.allSettled([
      settleProviderCost(reservation, 40),
      settleProviderCost(reservation, 40),
    ]);
    assert.equal(settlements.filter(result => result.status === 'fulfilled').length, 1,
      'concurrent duplicate settlement must apply exactly once');
    const daily = await pool.query(
      'SELECT reserved_micro_usd, actual_micro_usd FROM jerry_provider_daily_cost WHERE owner_uid=$1 AND usage_day=$2::date',
      [ownerUid, reservation.day],
    );
    assert.equal(Number(daily.rows[0].reserved_micro_usd), 0);
    assert.equal(Number(daily.rows[0].actual_micro_usd), 40);
  } finally {
    await pool.query('DELETE FROM jerry_provider_cost_reservations WHERE owner_uid=$1', [ownerUid]);
    await pool.query('DELETE FROM jerry_provider_daily_cost WHERE owner_uid=$1', [ownerUid]);
  }
});
