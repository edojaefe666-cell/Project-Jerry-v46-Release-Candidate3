export interface ResearchSource {
  title: string;
  url: string;
  publishedDate: string | null;
  content: string;
}

export interface LiveResearchResult {
  query: string;
  sources: ResearchSource[];
}

export interface LiveResearchOptions {
  query: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxResults?: number;
  signal?: AbortSignal;
}

function normalizeSourceUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Retrieves bounded source material from Tavily. Returned pages are references, not verified facts. */
export async function searchLiveResearch(options: LiveResearchOptions): Promise<LiveResearchResult> {
  const query = options.query.trim();
  const apiKey = options.apiKey.trim();
  if (!query || query.length > 500) throw new Error('Research query must contain 1–500 characters.');
  if (!apiKey) throw new Error('Live research provider is not configured.');
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = Math.min(15_000, Math.max(1_000, options.timeoutMs ?? 10_000));
  const maxResults = Math.min(5, Math.max(1, Math.floor(options.maxResults ?? 5)));
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(options.signal?.reason ?? new Error('Research request cancelled.'));
  if (options.signal?.aborted) abortFromParent();
  else options.signal?.addEventListener('abort', abortFromParent, { once: true });
  const timer = setTimeout(() => controller.abort(new Error('Research request timed out.')), timeoutMs);
  try {
    if (controller.signal.aborted) throw options.signal?.reason instanceof Error ? options.signal.reason : new Error('Research request cancelled.');
    const response = await fetchImpl('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        topic: 'general',
        search_depth: 'basic',
        max_results: maxResults,
        include_answer: false,
        include_raw_content: false,
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Live research provider returned HTTP ${response.status}.`);
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('Live research provider returned an invalid response.');
    }
    const raw = (payload as { results?: unknown }).results;
    if (!Array.isArray(raw)) throw new Error('Live research provider returned no source list.');
    const seen = new Set<string>();
    const sources: ResearchSource[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const record = item as Record<string, unknown>;
      const url = normalizeSourceUrl(record.url);
      if (!url || seen.has(url)) continue;
      const title = typeof record.title === 'string' ? record.title.trim().slice(0, 240) : '';
      const content = typeof record.content === 'string' ? record.content.trim().slice(0, 6000) : '';
      if (!title || !content) continue;
      seen.add(url);
      sources.push({ title, url, publishedDate: normalizeDate(record.published_date), content });
      if (sources.length >= maxResults) break;
    }
    return { query, sources };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abortFromParent);
  }
}
