import { resolveModelRoute, type ModelProvider, type ProviderConfiguration } from './modelRouter';

export interface VisionAnalysisOptions {
  prompt: string;
  mimeType: string;
  base64Data: string;
  configuration: ProviderConfiguration;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}
export interface VisionAnalysisResult { text: string; provider: ModelProvider; model: string }

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

async function postJson(url: string, headers: Record<string, string>, body: unknown, timeoutMs: number, fetchImpl: typeof fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
    if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}.`);
    const value: unknown = await response.json();
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Provider returned an invalid response.');
    return value as Record<string, any>;
  } finally { clearTimeout(timer); }
}

function readText(provider: ModelProvider, body: Record<string, any>): string {
  const value = provider === 'google'
    ? body.candidates?.[0]?.content?.parts?.map((part: any) => part.text ?? '').join('')
    : body.choices?.[0]?.message?.content;
  if (typeof value !== 'string' || !value.trim()) throw new Error('Vision provider returned no text content.');
  return value.trim();
}

/** Provider-neutral image understanding. Image bytes remain server-side and are never logged. */
export async function analyzeImageWithModelFallback(options: VisionAnalysisOptions): Promise<VisionAnalysisResult> {
  const prompt = options.prompt.trim();
  if (!prompt || prompt.length > 20_000) throw new Error('Vision prompt must contain 1–20000 characters.');
  if (!ALLOWED_IMAGE_TYPES.has(options.mimeType)) throw new Error('Unsupported image media type.');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(options.base64Data) || options.base64Data.length > 12_000_000) {
    throw new Error('Invalid or oversized base64 image payload.');
  }
  const timeoutMs = Math.min(60_000, Math.max(1_000, options.timeoutMs ?? 30_000));
  const fetchImpl = options.fetchImpl ?? fetch;
  const routes = resolveModelRoute('vision', options.configuration);
  if (!routes.length) throw new Error('No vision provider is configured.');
  const failures: string[] = [];
  for (const route of routes) {
    try {
      let body: Record<string, any>;
      if (route.provider === 'google') {
        const key = options.configuration.google?.apiKey;
        if (!key) continue;
        body = await postJson(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(route.model)}:generateContent`,
          { 'content-type': 'application/json', 'x-goog-api-key': key },
          { contents: [{ role: 'user', parts: [{ inlineData: { mimeType: options.mimeType, data: options.base64Data } }, { text: prompt }] }] },
          timeoutMs, fetchImpl
        );
      } else if (route.provider === 'openai') {
        const key = options.configuration.openai?.apiKey;
        if (!key) continue;
        body = await postJson('https://api.openai.com/v1/chat/completions',
          { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
          { model: route.model, messages: [{ role: 'user', content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${options.mimeType};base64,${options.base64Data}` } },
          ] }] }, timeoutMs, fetchImpl);
      } else continue;
      return { text: readText(route.provider, body), provider: route.provider, model: route.model };
    } catch (error) {
      failures.push(`${route.provider}: ${error instanceof Error ? error.message : 'request failed'}`);
    }
  }
  throw new Error(`All configured vision providers failed. ${failures.join(' ')}`);
}
