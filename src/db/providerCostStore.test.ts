import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateProviderCostMicroUsd, reserveProviderCost, settleProviderCost, getProviderCostLedgerSnapshot } from './providerCostStore.ts';

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


test('provider cost ledger snapshot is owner-scoped and exposes unsettled cost reservations', async () => {
  const statements: string[] = [];
  const snapshot = await getProviderCostLedgerSnapshot('owner-1', 20, {
    query: async (sql: string, params?: unknown[]) => {
      statements.push(sql);
      if (sql.includes('CREATE TABLE')) return { rows: [], rowCount: 0 };
      assert.deepEqual(params, ['owner-1', 20]);
      if (sql.includes('jerry_provider_daily_cost WHERE')) return { rows: [{
        day: '2026-11-27', dailyLimitMicroUsd: '1000000', reservedMicroUsd: '250000', actualMicroUsd: '125000',
      }], rowCount: 1 };
      return { rows: [{
        reservationId: 'pending-cost-1', day: '2026-11-27', reservedMicroUsd: '250000',
        status: 'reserved', createdAt: '2026-11-27T10:00:00Z', settledAt: null,
      }], rowCount: 1 };
    },
  } as never);
  assert.equal(snapshot.daily[0].reservedMicroUsd, '250000');
  assert.equal(snapshot.reservations[0].status, 'reserved');
  assert.equal(snapshot.reservations[0].settledAt, null);
  assert.equal(statements.length, 3);
  assert.ok(statements.every((sql) => !sql.includes('UPDATE ')));
});
