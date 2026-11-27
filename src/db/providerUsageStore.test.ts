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
