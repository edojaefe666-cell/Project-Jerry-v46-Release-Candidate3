import test from 'node:test';
import assert from 'node:assert/strict';
import { hasRecentOwnerAuthentication } from './deviceFirstBootstrap.ts';

const now = 1_800_000_000;

test('accepts a fresh owner authentication timestamp', () => {
  assert.equal(hasRecentOwnerAuthentication(now - 10, now), true);
});

test('accepts the exact five-minute freshness boundary', () => {
  assert.equal(hasRecentOwnerAuthentication(now - 300, now), true);
});

test('rejects authentication older than five minutes', () => {
  assert.equal(hasRecentOwnerAuthentication(now - 301, now), false);
});

test('rejects missing, string, fractional, negative and unsafe timestamps', () => {
  for (const value of [undefined, null, '1800000000', 12.5, -1, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(hasRecentOwnerAuthentication(value, now), false);
  }
});

test('rejects timestamps more than thirty seconds in the future', () => {
  assert.equal(hasRecentOwnerAuthentication(now + 31, now), false);
  assert.equal(hasRecentOwnerAuthentication(now + 30, now), true);
});

test('rejects invalid clock and freshness policy inputs', () => {
  assert.equal(hasRecentOwnerAuthentication(now, -1), false);
  assert.equal(hasRecentOwnerAuthentication(now, now, 0), false);
});
