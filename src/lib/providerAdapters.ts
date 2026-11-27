import { resolveModelRoute, type ModelProvider, type ModelTask, type ProviderConfiguration } from './modelRouter';
import { reserveProviderTokens, settleProviderTokens, type ProviderUsageReservation } from '../db/providerUsageStore.ts';
import { reserveConfiguredProviderOperation } from '../db/providerOperationStore.ts';
import { withSharedExecutionLease } from '../db/executionControl.ts';
import { estimateProviderCostMicroUsd, reserveProviderCost, settleProviderCost, type ProviderCostReservation, type ProviderModelPricing } from '../db/providerCostStore.ts';

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
  signal?: AbortSignal;
  ownerUid?: string;
  reserveOperation?: (ownerUid: string) => Promise<void>;
  reserveTokens?: typeof reserveProviderTokens;
  settleTokens?: typeof settleProviderTokens;
  withExecutionLease?: <T>(work: () => Promise<T>) => Promise<T>;
  pricing?: Record<string, ProviderModelPricing>;
  reserveCost?: typeof reserveProviderCost;
  settleCost?: typeof settleProviderCost;
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
  fetchImpl: typeof fetch,
  parentSignal?: AbortSignal
): Promise<Record<string, any>> {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener('abort', abortFromParent, { once: true });
  const timer = setTimeout(() => controller.abort(new Error('Provider request timed out.')), timeoutMs);
  try {
    if (controller.signal.aborted) throw new Error('Provider request cancelled.');
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    if (controller.signal.aborted) {
      try { await response.body?.cancel(); } catch { /* best-effort response cleanup */ }
      throw controller.signal.reason instanceof Error
        ? controller.signal.reason
        : new Error('Provider request cancelled.');
    }
    if (!response.ok) {
      // Do not read provider error bodies; cancel them so failed responses release the stream.
      try { await response.body?.cancel(); } catch { /* best-effort response cleanup */ }
      throw new Error(`Provider returned HTTP ${response.status}.`);
    }
    const body: unknown = await response.json();
    if (controller.signal.aborted) {
      throw controller.signal.reason instanceof Error
        ? controller.signal.reason
        : new Error('Provider request cancelled.');
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error('Provider returned an invalid response.');
    }
    return body as Record<string, any>;
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener('abort', abortFromParent);
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
  fetchImpl: typeof fetch,
  signal?: AbortSignal
): Promise<{ text: string; usageTokens?: number; inputTokens?: number; outputTokens?: number }> {
  if (provider === 'google') {
    const key = configuration.google?.apiKey;
    if (!key) throw new Error('Google provider is not configured.');
    const body = await requestJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify({ ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}), contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 2048 } }) },
      timeoutMs, fetchImpl, signal
    );
    const inputTokens = Number(body.usageMetadata?.promptTokenCount);
    const outputTokens = Number(body.usageMetadata?.candidatesTokenCount);
    const usage = Number(body.usageMetadata?.totalTokenCount);
    return { text: extractText(provider, body), ...(Number.isSafeInteger(usage) && usage >= 0 ? { usageTokens: usage } : {}), ...(Number.isSafeInteger(inputTokens) && inputTokens >= 0 && Number.isSafeInteger(outputTokens) && outputTokens >= 0 ? { inputTokens, outputTokens } : {}) };
  }
  if (provider === 'openai') {
    const key = configuration.openai?.apiKey;
    if (!key) throw new Error('OpenAI provider is not configured.');
    const body = await requestJson('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 2048, messages: [...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []), { role: 'user', content: prompt }] }),
    }, timeoutMs, fetchImpl, signal);
    const inputTokens = Number(body.usage?.prompt_tokens);
    const outputTokens = Number(body.usage?.completion_tokens);
    const usage = Number(body.usage?.total_tokens ?? (inputTokens + outputTokens));
    return { text: extractText(provider, body), ...(Number.isSafeInteger(usage) && usage >= 0 ? { usageTokens: usage } : {}), ...(Number.isSafeInteger(inputTokens) && inputTokens >= 0 && Number.isSafeInteger(outputTokens) && outputTokens >= 0 ? { inputTokens, outputTokens } : {}) };
  }
  if (provider === 'anthropic') {
    const key = configuration.anthropic?.apiKey;
    if (!key) throw new Error('Anthropic provider is not configured.');
    const body = await requestJson('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 2048, ...(systemInstruction ? { system: systemInstruction } : {}), messages: [{ role: 'user', content: prompt }] }),
    }, timeoutMs, fetchImpl, signal);
    const inputTokens = Number(body.usage?.input_tokens);
    const outputTokens = Number(body.usage?.output_tokens);
    const usage = inputTokens + outputTokens;
    return { text: extractText(provider, body), ...(Number.isSafeInteger(usage) && usage >= 0 ? { usageTokens: usage } : {}), ...(Number.isSafeInteger(inputTokens) && inputTokens >= 0 && Number.isSafeInteger(outputTokens) && outputTokens >= 0 ? { inputTokens, outputTokens } : {}) };
  }
  const local = configuration.local;
  if (!local?.enabled || !local.baseUrl) throw new Error('Local provider is not configured.');
  const base = safeLocalEndpoint(local.baseUrl);
  const endpoint = new URL('/v1/chat/completions', base);
  const body = await requestJson(endpoint.toString(), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 2048, messages: [...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []), { role: 'user', content: prompt }] }),
  }, timeoutMs, fetchImpl, signal);
  const usage = Number(body.usage?.total_tokens ?? (Number(body.usage?.prompt_tokens) + Number(body.usage?.completion_tokens)));
  return { text: extractText(provider, body), ...(Number.isSafeInteger(usage) && usage >= 0 ? { usageTokens: usage } : {}) };
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
    if (options.signal?.aborted) throw new Error('Jerry Brain request cancelled by emergency stop or client disconnect.');
    try {
      const executeAttempt = async (): Promise<ModelGenerationResult> => {
        let reservation: ProviderUsageReservation | undefined;
        let costReservation: ProviderCostReservation | undefined;
        if (options.ownerUid) {
          const dailyLimitTokens = Number(process.env.JERRY_DAILY_PROVIDER_TOKEN_LIMIT);
          if (!Number.isSafeInteger(dailyLimitTokens) || dailyLimitTokens < 1) {
            throw new Error('JERRY_DAILY_PROVIDER_TOKEN_LIMIT must be configured as a positive integer before Jerry can call external model providers.');
          }
          const maxOutputTokens = 2048;
          // UTF-8 byte count is a conservative tokenizer-independent input upper bound;
          // include framing overhead before reserving the hard per-attempt ceiling.
          const inputEstimate = Buffer.byteLength(prompt + (options.systemInstruction ?? ''), 'utf8') + 512;
          reservation = await (options.reserveTokens ?? reserveProviderTokens)({
            ownerUid: options.ownerUid,
            reserveTokens: inputEstimate + maxOutputTokens,
            dailyLimitTokens,
          });
        } else if (process.env.NODE_ENV === 'production') {
          throw new Error('Authenticated owner identity is required for provider usage budgeting.');
        }
        // Count every actual provider attempt, including each fallback, against
        // the same owner-scoped daily operation ceiling before network execution.
        if (options.ownerUid && route.provider !== 'local') {
          await (options.reserveOperation ?? reserveConfiguredProviderOperation)(options.ownerUid);
        }
        if (options.ownerUid && route.provider !== 'local') {
          const pricing = options.pricing ?? parseProviderPricingFromEnvironment(process.env.JERRY_PROVIDER_MODEL_PRICING_JSON);
          const modelPricing = pricing[`${route.provider}/${route.model}`];
          const dailyLimitMicroUsd = Number(process.env.JERRY_DAILY_PROVIDER_COST_LIMIT_MICRO_USD);
          if (!modelPricing || !Number.isSafeInteger(dailyLimitMicroUsd) || dailyLimitMicroUsd < 1) {
            if (process.env.NODE_ENV === 'production') {
              throw new Error('Explicit per-model provider pricing and JERRY_DAILY_PROVIDER_COST_LIMIT_MICRO_USD are required before hosted model execution.');
            }
          } else {
            const inputUpperBound = Buffer.byteLength(prompt + (options.systemInstruction ?? ''), 'utf8') + 512;
            const reserveMicroUsd = estimateProviderCostMicroUsd(inputUpperBound, 2048, modelPricing);
            costReservation = await (options.reserveCost ?? reserveProviderCost)({
              ownerUid: options.ownerUid, reserveMicroUsd, dailyLimitMicroUsd,
            });
          }
        }
        const generated = await generateFromProvider(route.provider, route.model, prompt, options.systemInstruction, options.configuration, timeoutMs, fetchImpl, options.signal);
        if (costReservation && generated.inputTokens !== undefined && generated.outputTokens !== undefined) {
          const pricing = options.pricing ?? parseProviderPricingFromEnvironment(process.env.JERRY_PROVIDER_MODEL_PRICING_JSON);
          const modelPricing = pricing[`${route.provider}/${route.model}`];
          if (modelPricing) {
            const actualMicroUsd = estimateProviderCostMicroUsd(generated.inputTokens, generated.outputTokens, modelPricing);
            try { await (options.settleCost ?? settleProviderCost)(costReservation, actualMicroUsd); } catch { /* reservation remains charged */ }
          }
        }
        if (reservation && generated.usageTokens !== undefined) {
          try { await (options.settleTokens ?? settleProviderTokens)(reservation, generated.usageTokens); } catch { /* reservation remains charged */ }
        }
        return { text: generated.text, provider: route.provider, model: route.model };
      };
      // Hold the durable shared stop lease from quota reservation through the
      // provider response. Owner stop can abort local work, and cannot commit a
      // cross-instance stop epoch in the middle of an admitted external call.
      const generated = options.ownerUid
        ? await (options.withExecutionLease ?? (work => withSharedExecutionLease(() => work())))(executeAttempt)
        : await executeAttempt();
      return generated;
    } catch (error) {
      if (options.signal?.aborted) throw new Error('Jerry Brain request cancelled by emergency stop or client disconnect.');
      failures.push(`${route.provider}: ${error instanceof Error ? error.message : 'request failed'}`);
    }
  }
  throw new Error(`All configured model providers failed. ${failures.join(' ')}`);
}


/** Parse owner-supplied prices. Rates are integer micro-USD per one million tokens. */
export function parseProviderPricingFromEnvironment(raw: string | undefined): Record<string, ProviderModelPricing> {
  if (!raw?.trim()) return {};
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error('JERRY_PROVIDER_MODEL_PRICING_JSON must contain valid JSON.'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('JERRY_PROVIDER_MODEL_PRICING_JSON must be an object keyed by provider/model.');
  }
  const result: Record<string, ProviderModelPricing> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!/^(google|openai|anthropic)\/[^\s]+$/.test(key) || !value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Provider pricing entries must use exact hosted provider/model keys.');
    }
    const item = value as Record<string, unknown>;
    const input = item.inputMicroUsdPerMillionTokens;
    const output = item.outputMicroUsdPerMillionTokens;
    if (!Number.isSafeInteger(input) || (input as number) < 1 || !Number.isSafeInteger(output) || (output as number) < 1) {
      throw new Error(`Provider pricing for ${key} must contain positive integer input and output micro-USD rates.`);
    }
    result[key] = { inputMicroUsdPerMillionTokens: input as number, outputMicroUsdPerMillionTokens: output as number };
  }
  return result;
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
