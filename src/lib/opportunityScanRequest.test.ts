import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOpportunityScanRequest } from './opportunityScanRequest';

test('accepts bounded interests and finite non-negative capital', () => {
  assert.deepEqual(
    parseOpportunityScanRequest({ interests: ['AI services', 'Local logistics'], availableCapitalUsd: 2500 }),
    { ok: true, value: { interests: ['AI services', 'Local logistics'], availableCapitalUsd: 2500 } },
  );
});

test('normalizes whitespace and removes duplicate interests case-insensitively', () => {
  assert.deepEqual(
    parseOpportunityScanRequest({ interests: [' AI services ', 'ai SERVICES'], availableCapitalUsd: 0 }),
    { ok: true, value: { interests: ['AI services'], availableCapitalUsd: 0 } },
  );
});

test('rejects missing, empty, excessive or malformed interests', () => {
  for (const interests of [undefined, [], Array.from({ length: 21 }, (_, i) => `topic-${i}`), [''], [7]]) {
    assert.equal(parseOpportunityScanRequest({ interests, availableCapitalUsd: 10 }).ok, false);
  }
  assert.equal(parseOpportunityScanRequest({ interests: ['x'.repeat(101)], availableCapitalUsd: 10 }).ok, false);
});

test('rejects negative, non-finite, string and excessive capital values', () => {
  for (const availableCapitalUsd of [-1, Number.NaN, Number.POSITIVE_INFINITY, '100', 1_000_000_001]) {
    assert.equal(parseOpportunityScanRequest({ interests: ['AI services'], availableCapitalUsd }).ok, false);
  }
});
