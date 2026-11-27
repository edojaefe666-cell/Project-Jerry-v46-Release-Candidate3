import test from 'node:test';
import assert from 'node:assert/strict';
import { reserveProviderTokens, settleProviderTokens } from './providerUsageStore.ts';

test('provider token reservation atomically creates a unique ledger identity', async () => {
  let statement='';
  let values:unknown[]|undefined;
  const reservation=await reserveProviderTokens({ownerUid:'owner-1',reserveTokens:2500,dailyLimitTokens:10000},{
    query:async(query:string,params?:unknown[])=>{statement=query;values=params;return {rows:[{reservation_id:params?.[3],day:'2026-11-27'}],rowCount:1};},
  } as never);
  assert.equal(reservation.ownerUid,'owner-1');
  assert.equal(reservation.reservedTokens,2500);
  assert.ok(reservation.reservationId);
  assert.match(statement,/ON CONFLICT\(owner_uid,usage_day\) DO UPDATE/);
  assert.match(statement,/INSERT INTO jerry_provider_token_reservations/);
  assert.match(statement,/SELECT \$4,\$1,usage_day,\$2,\$3,'reserved' FROM budget/);
  assert.deepEqual(values?.slice(0,3),['owner-1',10000,2500]);
});

test('provider token reservation rejects invalid or individually over-budget requests', async () => {
  await assert.rejects(()=>reserveProviderTokens({ownerUid:'owner-1',reserveTokens:10001,dailyLimitTokens:10000},{query:async()=>({rows:[]})} as never),/invalid|ceiling/i);
  await assert.rejects(()=>reserveProviderTokens({ownerUid:'',reserveTokens:10,dailyLimitTokens:10000},{query:async()=>({rows:[]})} as never),/invalid|ceiling/i);
});

test('provider token ceiling fails closed when atomic reservation returns no row', async () => {
  await assert.rejects(()=>reserveProviderTokens({ownerUid:'owner-1',reserveTokens:2500,dailyLimitTokens:10000},{query:async()=>({rows:[]})} as never),/daily provider token ceiling reached/i);
});

test('successful usage reconciliation claims a reservation once and records actual tokens', async () => {
  let statement='';
  let values:unknown[]|undefined;
  await settleProviderTokens({reservationId:'token-res-1',ownerUid:'owner-1',day:'2026-11-27',reservedTokens:2500,dailyLimitTokens:10000},1750,{
    query:async(query:string,params?:unknown[])=>{statement=query;values=params;return {rowCount:1,rows:[{owner_uid:'owner-1'}]};},
  } as never);
  assert.match(statement,/status='settled'/);
  assert.match(statement,/status='reserved'/);
  assert.match(statement,/UPDATE jerry_provider_daily_usage AS daily/);
  assert.equal(values?.[0],'token-res-1');
  assert.equal(values?.[5],1750);
});

test('duplicate token settlement is rejected', async () => {
  await assert.rejects(()=>settleProviderTokens({reservationId:'already-settled',ownerUid:'owner-1',day:'2026-11-27',reservedTokens:100,dailyLimitTokens:1000},50,{
    query:async()=>({rows:[],rowCount:0}),
  } as never),/already applied/i);
});

test('missing or out-of-bound usage metadata never releases reservation', async () => {
  let called=false;
  await settleProviderTokens({reservationId:'token-res-2',ownerUid:'owner-1',day:'2026-11-27',reservedTokens:100,dailyLimitTokens:1000},101,{
    query:async()=>{called=true;return {rows:[],rowCount:1};},
  } as never);
  assert.equal(called,false);
});


test('PostgreSQL provider token reservations enforce concurrent ceilings and exactly-once settlement', {
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
  const ownerUid = 'provider-token-integration-' + randomUUID();
  try {
    const attempts = await Promise.allSettled([
      reserveProviderTokens({ ownerUid, reserveTokens: 60, dailyLimitTokens: 100 }),
      reserveProviderTokens({ ownerUid, reserveTokens: 60, dailyLimitTokens: 100 }),
    ]);
    const accepted = attempts.filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof reserveProviderTokens>>> => result.status === 'fulfilled');
    assert.equal(accepted.length, 1, 'only one concurrent reservation may fit under the daily ceiling');
    const reservation = accepted[0].value;
    const settlements = await Promise.allSettled([
      settleProviderTokens(reservation, 40),
      settleProviderTokens(reservation, 40),
    ]);
    assert.equal(settlements.filter(result => result.status === 'fulfilled').length, 1,
      'concurrent duplicate settlement must apply exactly once');
    const daily = await pool.query(
      'SELECT reserved_tokens, actual_tokens FROM jerry_provider_daily_usage WHERE owner_uid=$1 AND usage_day=$2::date',
      [ownerUid, reservation.day],
    );
    assert.equal(Number(daily.rows[0].reserved_tokens), 0);
    assert.equal(Number(daily.rows[0].actual_tokens), 40);
  } finally {
    await pool.query('DELETE FROM jerry_provider_token_reservations WHERE owner_uid=$1', [ownerUid]);
    await pool.query('DELETE FROM jerry_provider_daily_usage WHERE owner_uid=$1', [ownerUid]);
  }
});
