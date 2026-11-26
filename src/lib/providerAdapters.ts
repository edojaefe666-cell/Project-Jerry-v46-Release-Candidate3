import { resolveModelRoute, type ModelProvider, type ModelTask, type ProviderConfiguration } from './modelRouter';

export interface ModelGenerationResult {
  text: string;
  provider: ModelProvider;
  model: string;
}

export interface ModelGenerationOptions {
  task: ModelTask;
  prompt: string;
  systemInstruction?: string;
  configuration: ProviderConfiguration;
  preferredProvider?: ModelProvider;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function safeLocalEndpoint(baseUrl: string): URL {
  const url = new URL(baseUrl);
  const host = url.hostname.toLowerCase();
  if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(host) ||
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.username || url.password) {
    throw new Error('Local model endpoint must use a loopback host without embedded credentials.');
  }
  return url;
}

async function requestJson(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: typeof fetch
): Promise<Record<string, any>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      // Do not surface provider response bodies: they may contain request data or secrets.
      throw new Error(`Provider returned HTTP ${response.status}.`);
    }
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error('Provider returned an invalid response.');
    }
    return body as Record<string, any>;
  } finally {
    clearTimeout(timer);
  }
}

function extractText(provider: ModelProvider, body: Record<string, any>): string {
  let value: unknown;
  if (provider === 'google') value = body.candidates?.[0]?.content?.parts?.map((part: any) => part.text ?? '').join('');
  else if (provider === 'anthropic') value = body.content?.filter((part: any) => part.type === 'text').map((part: any) => part.text ?? '').join('');
  else value = body.choices?.[0]?.message?.content;
  if (typeof value !== 'string' || !value.trim()) throw new Error('Provider returned no text content.');
  return value.trim();
}

async function generateFromProvider(
  provider: ModelProvider,
  model: string,
  prompt: string,
  systemInstruction: string | undefined,
  configuration: ProviderConfiguration,
  timeoutMs: number,
  fetchImpl: typeof fetch
): Promise<string> {
  if (provider === 'google') {
    const key = configuration.google?.apiKey;
    if (!key) throw new Error('Google provider is not configured.');
    const body = await requestJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify({ ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}), contents: [{ role: 'user', parts: [{ text: prompt }] }] }) },
      timeoutMs, fetchImpl
    );
    return extractText(provider, body);
  }
  if (provider === 'openai') {
    const key = configuration.openai?.apiKey;
    if (!key) throw new Error('OpenAI provider is not configured.');
    const body = await requestJson('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages: [...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []), { role: 'user', content: prompt }] }),
    }, timeoutMs, fetchImpl);
    return extractText(provider, body);
  }
  if (provider === 'anthropic') {
    const key = configuration.anthropic?.apiKey;
    if (!key) throw new Error('Anthropic provider is not configured.');
    const body = await requestJson('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 2048, ...(systemInstruction ? { system: systemInstruction } : {}), messages: [{ role: 'user', content: prompt }] }),
    }, timeoutMs, fetchImpl);
    return extractText(provider, body);
  }
  const local = configuration.local;
  if (!local?.enabled || !local.baseUrl) throw new Error('Local provider is not configured.');
  const base = safeLocalEndpoint(local.baseUrl);
  const endpoint = new URL('/v1/chat/completions', base);
  const body = await requestJson(endpoint.toString(), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, messages: [...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []), { role: 'user', content: prompt }] }),
  }, timeoutMs, fetchImpl);
  return extractText(provider, body);
}

/**
 * Server-side provider adapter with ordered fallback. Credentials are supplied
 * by server configuration and are never included in results or error messages.
 */
export async function generateWithModelFallback(options: ModelGenerationOptions): Promise<ModelGenerationResult> {
  const prompt = options.prompt.trim();
  if (!prompt || prompt.length > 100_000) throw new Error('Prompt must contain 1–100000 characters.');
  const timeoutMs = Math.min(60_000, Math.max(1_000, options.timeoutMs ?? 20_000));
  const fetchImpl = options.fetchImpl ?? fetch;
  const routes = resolveModelRoute(options.task, options.configuration, options.preferredProvider);
  if (!routes.length) throw new Error('No model provider is configured for this task.');

  const failures: string[] = [];
  for (const route of routes) {
    try {
      const text = await generateFromProvider(route.provider, route.model, prompt, options.systemInstruction, options.configuration, timeoutMs, fetchImpl);
      return { text, provider: route.provider, model: route.model };
    } catch (error) {
      failures.push(`${route.provider}: ${error instanceof Error ? error.message : 'request failed'}`);
    }
  }
  throw new Error(`All configured model providers failed. ${failures.join(' ')}`);
}

export function providerConfigurationFromEnvironment(env: Record<string, string | undefined>): ProviderConfiguration {
  return {
    google: env.GEMINI_API_KEY || env.GOOGLE_AI_API_KEY
      ? { apiKey: env.GEMINI_API_KEY || env.GOOGLE_AI_API_KEY, model: env.JERRY_GOOGLE_MODEL }
      : undefined,
    openai: env.OPENAI_API_KEY ? { apiKey: env.OPENAI_API_KEY, model: env.JERRY_OPENAI_MODEL } : undefined,
    anthropic: env.ANTHROPIC_API_KEY ? { apiKey: env.ANTHROPIC_API_KEY, model: env.JERRY_ANTHROPIC_MODEL } : undefined,
    local: env.JERRY_LOCAL_MODEL_ENABLED === '1' && env.JERRY_LOCAL_MODEL_URL
      ? { enabled: true, baseUrl: env.JERRY_LOCAL_MODEL_URL, model: env.JERRY_LOCAL_MODEL_NAME }
      : undefined,
  };
}
