import test from 'node:test';
import assert from 'node:assert/strict';
import { reserveProviderTokens, settleProviderTokens } from './providerUsageStore.ts';

test('provider token reservation is a single atomic owner/day ceiling operation', async () => {
  const calls: Array<{query:string;values?:unknown[]}> = [];
  const reservation = await reserveProviderTokens({
    ownerUid:'owner-1',reserveTokens:2500,dailyLimitTokens:10000,
  }, {
    query: async (query:string,values?:unknown[]) => {
      calls.push({query,values});
      return {rows:[{day:'2026-11-27'}],rowCount:1};
    },
  } as never);
  assert.equal(reservation.ownerUid,'owner-1');
  assert.equal(reservation.reservedTokens,2500);
  assert.equal(reservation.dailyLimitTokens,10000);
  const upsert=calls.find(x=>x.query.includes('INSERT INTO jerry_provider_daily_usage'));
  assert.ok(upsert);
  assert.match(upsert!.query,/ON CONFLICT\(owner_uid,usage_day\) DO UPDATE/);
  assert.match(upsert!.query,/reserved_tokens \+ jerry_provider_daily_usage\.actual_tokens/);
});

test('provider token reservation rejects invalid or individually over-budget requests', async () => {
  await assert.rejects(() => reserveProviderTokens({
    ownerUid:'owner-1',reserveTokens:10001,dailyLimitTokens:10000,
  }, {query:async()=>({rows:[]})} as never), /invalid|ceiling/i);
  await assert.rejects(() => reserveProviderTokens({
    ownerUid:'',reserveTokens:10,dailyLimitTokens:10000,
  }, {query:async()=>({rows:[]})} as never), /invalid|ceiling/i);
});

test('provider token ceiling fails closed when atomic reservation returns no row', async () => {
  await assert.rejects(() => reserveProviderTokens({
    ownerUid:'owner-1',reserveTokens:2500,dailyLimitTokens:10000,
  }, {query:async()=>({rows:[]})} as never), /daily provider token ceiling reached/i);
});

test('successful usage reconciliation releases reservation and records actual tokens', async () => {
  let statement='';
  let values:unknown[]|undefined;
  await settleProviderTokens({
    ownerUid:'owner-1',day:'2026-11-27',reservedTokens:2500,dailyLimitTokens:10000,
  },1750,{
    query:async(query:string,params?:unknown[])=>{statement=query;values=params;return {rowCount:1,rows:[]};},
  } as never);
  assert.match(statement,/reserved_tokens=GREATEST\(0,reserved_tokens-\$4\)/);
  assert.match(statement,/actual_tokens=actual_tokens\+\$5/);
  assert.equal(values?.[3],2500);
  assert.equal(values?.[4],1750);
});

test('missing or out-of-bound usage metadata never releases the conservative reservation', async () => {
  let called=false;
  const queryable={query:async()=>{called=true;return {rowCount:1,rows:[]};}};
  await settleProviderTokens({
    ownerUid:'owner-1',day:'2026-11-27',reservedTokens:100,dailyLimitTokens:1000,
  },101,queryable as never);
  assert.equal(called,false);
});
