import test from 'node:test';
import assert from 'node:assert/strict';
import { createOwnerRateLimiter } from './requestRateLimit';

function responseRecorder() {
  const headers = new Map<string, string>();
  let statusCode = 200;
  let body: unknown;
  return {
    headers,
    get statusCode() { return statusCode; },
    get body() { return body; },
    status(code: number) { statusCode = code; return this; },
    setHeader(name: string, value: string) { headers.set(name.toLowerCase(), value); return this; },
    json(value: unknown) { body = value; return this; },
  };
}

test('limits requests independently per authenticated owner and reports retry timing', () => {
  let currentTime = 1_000;
  const limit = createOwnerRateLimiter({ limit: 2, windowMs: 10_000, now: () => currentTime });
  const call = (uid: string) => {
    const response = responseRecorder();
    let nextCalled = false;
    limit({ user: { uid } }, response, () => { nextCalled = true; });
    return { response, nextCalled };
  };

  assert.equal(call('owner-a').nextCalled, true);
  assert.equal(call('owner-a').nextCalled, true);
  const blocked = call('owner-a');
  assert.equal(blocked.nextCalled, false);
  assert.equal(blocked.response.statusCode, 429);
  assert.equal(blocked.response.headers.get('retry-after'), '10');
  assert.equal(blocked.response.headers.get('ratelimit-remaining'), '0');
  assert.equal(call('owner-b').nextCalled, true);

  currentTime += 10_000;
  assert.equal(call('owner-a').nextCalled, true);
});

test('rejects missing owner identity and invalid limiter configuration', () => {
  const limit = createOwnerRateLimiter({ limit: 1, windowMs: 1_000 });
  const response = responseRecorder();
  let nextCalled = false;
  limit({}, response, () => { nextCalled = true; });
  assert.equal(response.statusCode, 401);
  assert.equal(nextCalled, false);
  assert.throws(() => createOwnerRateLimiter({ limit: 0, windowMs: 1_000 }), /positive safe integers/);
});

test('bounds retained owner buckets when many identities are observed', () => {
  let currentTime = 5_000;
  const limit = createOwnerRateLimiter({ limit: 1, windowMs: 10_000, maxKeys: 2, now: () => currentTime });
  for (const uid of ['one', 'two', 'three', 'four']) {
    const response = responseRecorder();
    limit({ user: { uid } }, response, () => undefined);
  }
  // The bounded map evicts the oldest identity rather than growing forever.
  const response = responseRecorder();
  let nextCalled = false;
  limit({ user: { uid: 'four' } }, response, () => { nextCalled = true; });
  assert.equal(response.statusCode, 429);
  assert.equal(nextCalled, false);
  currentTime += 10_001;
  const fresh = responseRecorder();
  let freshNext = false;
  limit({ user: { uid: 'four' } }, fresh, () => { freshNext = true; });
  assert.equal(freshNext, true);
});
