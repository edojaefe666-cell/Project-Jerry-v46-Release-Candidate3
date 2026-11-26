export interface OpportunityScanRequest {
  interests: string[];
  availableCapitalUsd: number;
}

export type OpportunityScanRequestResult =
  | { ok: true; value: OpportunityScanRequest }
  | { ok: false; error: string };

/** Normalize and validate the public Opportunity Radar request before any provider call. */
export function parseOpportunityScanRequest(body: {
  interests?: unknown;
  availableCapitalUsd?: unknown;
}): OpportunityScanRequestResult {
  const interests = Array.isArray(body.interests)
    ? body.interests
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean)
        .slice(0, 5)
    : [];
  if (interests.length === 0) {
    return { ok: false, error: 'Specify at least one area of interest to scan.' };
  }
  const availableCapitalUsd = body.availableCapitalUsd === undefined
    ? 1500
    : Number(body.availableCapitalUsd);
  if (!Number.isFinite(availableCapitalUsd) || availableCapitalUsd < 0 || availableCapitalUsd > 1_000_000_000) {
    return { ok: false, error: 'Available capital must be a finite amount between 0 and 1,000,000,000 USD.' };
  }
  return { ok: true, value: { interests, availableCapitalUsd } };
}
