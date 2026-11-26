import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOpportunityScanRequest } from './opportunityScanRequest.ts';

test('normalizes interests and applies the documented default capital', () => {
  assert.deepEqual(parseOpportunityScanRequest({
    interests: [' AI services ', '', 7, 'Local logistics'],
  }), {
    ok: true,
    value: { interests: ['AI services', 'Local logistics'], availableCapitalUsd: 1500 },
  });
});

test('limits requests to five non-empty interests', () => {
  const result = parseOpportunityScanRequest({
    interests: ['a', 'b', 'c', 'd', 'e', 'f'],
    availableCapitalUsd: 0,
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.value.interests, ['a', 'b', 'c', 'd', 'e']);
});

test('rejects missing interests and invalid capital before research starts', () => {
  assert.deepEqual(parseOpportunityScanRequest({ interests: [] }), {
    ok: false,
    error: 'Specify at least one area of interest to scan.',
  });
  for (const availableCapitalUsd of [-1, 'not-money', Infinity, 1_000_000_001]) {
    const result = parseOpportunityScanRequest({ interests: ['AI services'], availableCapitalUsd });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /Available capital/);
  }
});

test('accepts zero capital without silently replacing it', () => {
  assert.deepEqual(parseOpportunityScanRequest({
    interests: ['AI services'],
    availableCapitalUsd: 0,
  }), { ok: true, value: { interests: ['AI services'], availableCapitalUsd: 0 } });
});
