import test from 'node:test';
import assert from 'node:assert/strict';
import { reserveProviderOperation } from './providerOperationStore.ts';

test('provider operation budget atomically consumes a shared owner/day slot', async () => {
  let statement='';
  let values:unknown[]|undefined;
  const result=await reserveProviderOperation({ownerUid:'owner-1',dailyLimitOperations:50},{
    query:async(sql:string,params?:unknown[])=>{statement=sql;values=params;return {rows:[{day:'2026-11-27'}],rowCount:1};},
  } as never);
  assert.deepEqual(result,{ownerUid:'owner-1',day:'2026-11-27'});
  assert.match(statement,/ON CONFLICT\(owner_uid,usage_day\) DO UPDATE/);
  assert.match(statement,/used_operations < jerry_provider_daily_operations\.daily_limit_operations/);
  assert.deepEqual(values,['owner-1',50]);
});

test('provider operation budget fails closed at the configured daily ceiling',async()=>{
  await assert.rejects(()=>reserveProviderOperation({ownerUid:'owner-1',dailyLimitOperations:50},{
    query:async()=>({rows:[],rowCount:0}),
  } as never),/daily provider operation ceiling reached/i);
});

test('provider operation budget rejects invalid owner or limit',async()=>{
  await assert.rejects(()=>reserveProviderOperation({ownerUid:'',dailyLimitOperations:50},{query:async()=>({rows:[]})} as never),/invalid/i);
  await assert.rejects(()=>reserveProviderOperation({ownerUid:'owner-1',dailyLimitOperations:0},{query:async()=>({rows:[]})} as never),/invalid/i);
});
