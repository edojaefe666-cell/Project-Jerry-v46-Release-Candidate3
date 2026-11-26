export interface OpportunityScanRequest {
  interests: string[];
  availableCapitalUsd: number;
}

export type OpportunityScanRequestResult =
  | { ok: true; value: OpportunityScanRequest }
  | { ok: false; error: string };

/** Validates the owner-supplied Opportunity Radar scope before any paid provider call. */
export function parseOpportunityScanRequest(input: {
  interests?: unknown;
  availableCapitalUsd?: unknown;
}): OpportunityScanRequestResult {
  if (!Array.isArray(input.interests) || input.interests.length < 1 || input.interests.length > 20) {
    return { ok: false, error: 'Provide 1–20 areas of interest.' };
  }
  const interests: string[] = [];
  const seen = new Set<string>();
  for (const raw of input.interests) {
    if (typeof raw !== 'string') return { ok: false, error: 'Every interest must be text.' };
    const value = raw.trim();
    if (!value || value.length > 100) return { ok: false, error: 'Each interest must contain 1–100 characters.' };
    const key = value.toLocaleLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      interests.push(value);
    }
  }
  if (interests.length === 0) return { ok: false, error: 'At least one valid interest is required.' };
  const capital = input.availableCapitalUsd;
  if (typeof capital !== 'number' || !Number.isFinite(capital) || capital < 0 || capital > 1_000_000_000) {
    return { ok: false, error: 'Available capital must be a finite USD amount between 0 and 1,000,000,000.' };
  }
  return { ok: true, value: { interests, availableCapitalUsd: capital } };
}
