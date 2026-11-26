import test from 'node:test';
import assert from 'node:assert/strict';
import { runOpportunityRadar, OpportunityRadarError } from './opportunityRadar';
import type { ProviderConfiguration } from './modelRouter';

const configuration = {} as ProviderConfiguration;
const source = {
  title: 'Nigeria SME market report',
  url: 'https://example.com/nigeria-sme',
  publishedDate: null,
  content: 'The report describes a need for small-business workflow tools.',
};
const validModelOutput = JSON.stringify([{
  interestTopic: 'AI services',
  title: 'SME workflow automation',
  kind: 'Business',
  summary: 'A possible service based on the described need.',
  profitabilityAnalysis: 'Revenue and margins require validation.',
  riskAnalysis: 'Customer demand and willingness to pay remain uncertain.',
  estimatedCapitalUsd: 900,
  sourceUrls: [source.url],
  sourceSupportedObservations: ['The report describes a need for workflow tools.'],
  estimatesAndAssumptions: ['Pricing is an assumption.'],
  nextAction: 'Interview ten local SMEs.',
}]);

test('returns explicit unavailable status when live research credentials are missing', async () => {
  await assert.rejects(
    runOpportunityRadar({
      interests: ['AI services'], availableCapitalUsd: 1000, configuration,
      search: async () => { throw new Error('Search must not run without credentials'); },
    }),
    (error: unknown) => error instanceof OpportunityRadarError &&
      error.status === 503 && error.code === 'LIVE_RESEARCH_NOT_CONFIGURED',
  );
});

test('returns unavailable when research has no usable sources and never calls the model', async () => {
  await assert.rejects(
    runOpportunityRadar({
      interests: ['AI services'], availableCapitalUsd: 1000, researchApiKey: 'test-key', configuration,
      search: async () => ({ query: 'test', sources: [] }),
      generate: async () => { throw new Error('Model must not run without sources'); },
    }),
    (error: unknown) => error instanceof OpportunityRadarError &&
      error.status === 503 && error.code === 'NO_USABLE_RESEARCH_SOURCES',
  );
});

test('rejects malformed model output as a gateway failure', async () => {
  await assert.rejects(
    runOpportunityRadar({
      interests: ['AI services'], availableCapitalUsd: 1000, researchApiKey: 'test-key', configuration,
      search: async () => ({ query: 'test', sources: [source] }),
      generate: async () => ({ text: '{broken json', provider: 'google', model: 'test-model' }),
    }),
    (error: unknown) => error instanceof OpportunityRadarError &&
      error.status === 502 && error.code === 'INVALID_RESEARCH_MODEL_OUTPUT',
  );
});

test('accepts source-matched findings and reports above-budget estimates without clamping', async () => {
  const result = await runOpportunityRadar({
    interests: ['AI services'], availableCapitalUsd: 500, researchApiKey: 'test-key', configuration,
    search: async () => ({ query: 'test', sources: [source] }),
    generate: async () => ({ text: validModelOutput, provider: 'google', model: 'test-model' }),
  });
  assert.equal(result.alerts.length, 1);
  assert.equal(result.alerts[0].capitalFit, 'above_budget');
  assert.equal(result.alerts[0].estimatedCapitalUsd, 900);
  assert.deepEqual(result.alerts[0].verifiedSources, []);
  assert.equal(result.alerts[0].sourceReferences?.[0].uri, source.url);
  assert.equal(result.sources[0].uri, source.url);
});

test('rejects model findings that cite a URL not returned by research', async () => {
  const forged = JSON.stringify([{
    interestTopic: 'AI services', title: 'Unsupported opportunity', kind: 'Business',
    summary: 'Unsupported', profitabilityAnalysis: 'Unknown', riskAnalysis: 'Unknown',
    estimatedCapitalUsd: 100, sourceUrls: ['https://fake.example/source'],
    nextAction: 'Do more research',
  }]);
  await assert.rejects(
    runOpportunityRadar({
      interests: ['AI services'], availableCapitalUsd: 1000, researchApiKey: 'test-key', configuration,
      search: async () => ({ query: 'test', sources: [source] }),
      generate: async () => ({ text: forged, provider: 'google', model: 'test-model' }),
    }),
    (error: unknown) => error instanceof OpportunityRadarError &&
      error.status === 502 && error.code === 'INVALID_RESEARCH_MODEL_OUTPUT',
  );
});
