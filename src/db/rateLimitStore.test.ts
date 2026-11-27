import test from 'node:test';
import assert from 'node:assert/strict';
import { consumeSharedOwnerRateLimit, createSharedOwnerRateLimiter } from './rateLimitStore.ts';

test('shared owner limiter uses one atomic PostgreSQL upsert for cross-instance counting', async () => {
  const calls: Array<{query:string;values?:unknown[]}> = [];
  const result = await consumeSharedOwnerRateLimit({
    ownerUid:'owner-test',bucketKey:'brain',limit:2,windowMs:60_000,
  }, {
    query: async (query:string, values?:unknown[]) => {
      calls.push({query,values});
      if (query.includes('INSERT INTO jerry_owner_rate_limits')) {
        return {rows:[{count:2,windowStartedAt:new Date(10_000),allowed:true}]};
      }
      return {rows:[]};
    },
  } as never);
  assert.equal(result.allowed,true);
  assert.equal(result.count,2);
  assert.equal(result.resetAt,70_000);
  const upsert=calls.find(call=>call.query.includes('INSERT INTO jerry_owner_rate_limits'));
  assert.ok(upsert);
  assert.match(upsert!.query,/request_count=jerry_owner_rate_limits\\.request_count \\+ 1/);
  assert.match(upsert!.query,/request_count=jerry_owner_rate_limits\\.request_count \\+ 1/);
});

test('shared rate limiter rejects over-limit decisions and reports retry metadata', async () => {
  const middleware=createSharedOwnerRateLimiter('chat',3,60_000,async()=>({
    allowed:false,count:4,resetAt:120_000,
  }));
  const headers=new Map<string,string>();
  let status=200,body:unknown,nextCalled=false;
  const response={
    setHeader:(name:string,value:string)=>headers.set(name.toLowerCase(),value),
    status:(code:number)=>{status=code;return response;},
    json:(value:unknown)=>{body=value;return response;},
  };
  await middleware(
    {user:{uid:'owner-a'}} as never,
    response as never,
    ()=>{nextCalled=true;},
  );
  assert.equal(status,429);
  assert.equal(nextCalled,false);
  assert.equal(headers.get('ratelimit-limit'),'3');
  assert.equal(headers.get('ratelimit-remaining'),'0');
  assert.equal(headers.get('retry-after'),'1');
  assert.match(String((body as {error:string}).error),/shared request limit reached/);
});

test('shared rate limiter fails closed when PostgreSQL is unavailable', async () => {
  const middleware=createSharedOwnerRateLimiter('voice',5,60_000,async()=>{throw new Error('database offline');});
  let status=200,nextCalled=false;
  const response={status:(code:number)=>{status=code;return response;},json:()=>response,setHeader:()=>response};
  await middleware({user:{uid:'owner-a'}} as never,response as never,()=>{nextCalled=true;});
  assert.equal(status,503);
  assert.equal(nextCalled,false);
});

test('shared rate limiter requires authenticated owner identity', async () => {
  const middleware=createSharedOwnerRateLimiter('brain',2,60_000,async()=>{throw new Error('must not run');});
  let status=200,nextCalled=false;
  const response={status:(code:number)=>{status=code;return response;},json:()=>response,setHeader:()=>response};
  await middleware({} as never,response as never,()=>{nextCalled=true;});
  assert.equal(status,401);
  assert.equal(nextCalled,false);
});
