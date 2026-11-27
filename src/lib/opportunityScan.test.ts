import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOpportunityScan } from './opportunityScan';

const sources = [{ title: 'Market report', url: 'https://example.com/report', publishedDate: null, content: 'Demand evidence' }];
const entry = {
  interestTopic: 'AI services', title: 'Workflow automation service', kind: 'Business',
  summary: 'A source-supported customer problem.', profitabilityAnalysis: 'Margins remain an estimate.',
  riskAnalysis: 'Customer acquisition risk.', estimatedCapitalUsd: 800,
  sourceUrls: ['https://example.com/report'], sourceSupportedObservations: ['The report describes demand.'],
  estimatesAndAssumptions: ['Pricing is assumed.'], nextAction: 'Interview potential customers.',
};

test('binds opportunity evidence to exact retrieved URLs and labels budget fit', () => {
  const alerts = parseOpportunityScan({
    raw: JSON.stringify([entry]), sources, interests: ['AI services'], availableCapitalUsd: 500,
    now: new Date('2026-11-26T12:00:00.000Z'),
  });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].capitalFit, 'above_budget');
  assert.equal(alerts[0].verifiedSources.length, 0);
  assert.equal(alerts[0].sourceReferences?.[0].uri, sources[0].url);
  assert.equal(alerts[0].evidenceStatus, 'source_referenced_model_analysis_not_independently_verified');
});

test('rejects malformed JSON, empty lists, and opportunities with unrecognized URLs', () => {
  assert.throws(() => parseOpportunityScan({ raw: '{bad', sources, interests: ['AI services'], availableCapitalUsd: 1000 }));
  assert.throws(() => parseOpportunityScan({ raw: '[]', sources, interests: ['AI services'], availableCapitalUsd: 1000 }));
  assert.throws(() => parseOpportunityScan({
    raw: JSON.stringify([{ ...entry, sourceUrls: ['https://attacker.example/fake'] }]),
    sources, interests: ['AI services'], availableCapitalUsd: 1000,
  }), /matching retrieved source/);
});

test('rejects invalid capital estimates and missing required model fields', () => {
  assert.throws(() => parseOpportunityScan({
    raw: JSON.stringify([{ ...entry, estimatedCapitalUsd: '800' }]),
    sources, interests: ['AI services'], availableCapitalUsd: 1000,
  }), /capital estimate/);
  assert.throws(() => parseOpportunityScan({
    raw: JSON.stringify([{ ...entry, title: '' }]),
    sources, interests: ['AI services'], availableCapitalUsd: 1000,
  }), /title/);
});
