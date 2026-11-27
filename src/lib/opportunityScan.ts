import type { OpportunityAlert } from './types';
import type { ResearchSource } from './liveResearch';

export interface OpportunityScanParseOptions {
  raw: string;
  sources: ResearchSource[];
  interests: string[];
  availableCapitalUsd: number;
  now?: Date;
}

/** Validates model output and binds every opportunity to an exact retrieved source URL. */
export function parseOpportunityScan(options: OpportunityScanParseOptions): OpportunityAlert[] {
  const { raw, sources, interests, availableCapitalUsd } = options;
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed: unknown = JSON.parse(cleaned);
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 5) {
    throw new Error('Research model returned an invalid opportunity list.');
  }
  const sourceByUrl = new Map(sources.map((source) => [source.url, source]));
  const now = options.now ?? new Date();

  return parsed.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error('Research model returned an invalid opportunity.');
    }
    const item = entry as Record<string, unknown>;
    const textField = (key: string, max = 1200): string => {
      const value = item[key];
      if (typeof value !== 'string' || !value.trim()) throw new Error(`Research model omitted ${key}.`);
      return value.trim().slice(0, max);
    };
    const sourceUrls = Array.isArray(item.sourceUrls)
      ? item.sourceUrls.filter((value): value is string => typeof value === 'string')
      : [];
    const sourceReferences = [...new Set(sourceUrls)]
      .map((url) => sourceByUrl.get(url))
      .filter((source): source is ResearchSource => Boolean(source))
      .map((source) => ({ title: source.title, uri: source.url, publishedDate: source.publishedDate }));
    if (sourceReferences.length === 0) {
      throw new Error('Research model returned an opportunity without a matching retrieved source.');
    }
    if (typeof item.estimatedCapitalUsd !== 'number' || !Number.isFinite(item.estimatedCapitalUsd) || item.estimatedCapitalUsd < 0) {
      throw new Error('Research model returned an invalid capital estimate.');
    }
    if (item.kind !== 'Business' && item.kind !== 'Investment') {
      throw new Error('Research model returned an invalid opportunity kind.');
    }
    const listField = (key: string): string[] => Array.isArray(item[key])
      ? (item[key] as unknown[]).filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim().slice(0, 500)).filter(Boolean).slice(0, 8)
      : [];
    return {
      id: `alert-${now.getTime()}-${index}`,
      interestTopic: typeof item.interestTopic === 'string' && interests.includes(item.interestTopic)
        ? item.interestTopic : interests[index % interests.length],
      title: textField('title', 240),
      kind: item.kind,
      summary: textField('summary'),
      profitabilityAnalysis: textField('profitabilityAnalysis'),
      riskAnalysis: textField('riskAnalysis'),
      estimatedCapitalUsd: item.estimatedCapitalUsd,
      capitalFit: item.estimatedCapitalUsd <= availableCapitalUsd ? 'within_budget' : 'above_budget',
      verifiedSources: [],
      sourceReferences,
      evidenceStatus: 'source_referenced_model_analysis_not_independently_verified',
      sourceSupportedObservations: listField('sourceSupportedObservations'),
      estimatesAndAssumptions: listField('estimatesAndAssumptions'),
      nextAction: textField('nextAction'),
      status: 'new',
      createdAt: now.toISOString(),
    };
  });
}
