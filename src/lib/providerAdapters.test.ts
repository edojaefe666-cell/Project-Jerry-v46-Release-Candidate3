import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWithModelFallback, providerConfigurationFromEnvironment } from './providerAdapters';

const jsonResponse = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'content-type': 'application/json' },
});

test('calls the configured Google provider and returns provider-neutral output', async () => {
  let requested = '';
  let headers: HeadersInit | undefined;
  const result = await generateWithModelFallback({
    task: 'chat', prompt: 'hello', configuration: { google: { apiKey: 'secret', model: 'gemini-test' } },
    fetchImpl: async (input, init) => {
      requested = String(input);
      headers = init?.headers;
      return jsonResponse({ candidates: [{ content: { parts: [{ text: 'Hi there' }] } }] });
    },
  });
  assert.equal(result.text, 'Hi there');
  assert.equal(result.provider, 'google');
  assert.match(requested, /gemini-test/);
  assert.doesNotMatch(requested, /secret/);
  assert.equal(new Headers(headers).get('x-goog-api-key'), 'secret');
});

test('falls back to OpenAI when the preferred Google provider fails', async () => {
  const calls: string[] = [];
  let openAiBody: any;
  const result = await generateWithModelFallback({
    task: 'chat', prompt: 'hello', systemInstruction: 'Follow Jerry governance rules.',
    configuration: { google: { apiKey: 'g-key' }, openai: { apiKey: 'o-key', model: 'gpt-test' } },
    fetchImpl: async (input, init) => {
      calls.push(String(input));
      if (calls.length === 1) return jsonResponse({ error: 'unavailable' }, 503);
      openAiBody = JSON.parse(String(init?.body));
      return jsonResponse({ choices: [{ message: { content: 'Fallback response' } }] });
    },
  });
  assert.equal(result.provider, 'openai');
  assert.equal(result.text, 'Fallback response');
  assert.equal(calls.length, 2);
  assert.equal(openAiBody.messages[0].role, 'system');
  assert.equal(openAiBody.messages[0].content, 'Follow Jerry governance rules.');
});

test('aborts the active provider request and never falls back after emergency stop', async () => {
  const controller = new AbortController();
  let calls = 0;
  const pendingFetch = (_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    calls += 1;
    init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    queueMicrotask(() => controller.abort(new Error('owner stop')));
  });
  await assert.rejects(() => generateWithModelFallback({
    task: 'chat', prompt: 'hello',
    configuration: { google: { apiKey: 'g-key' }, openai: { apiKey: 'o-key' } },
    fetchImpl: pendingFetch as typeof fetch,
    signal: controller.signal,
  }), /cancelled by emergency stop/);
  assert.equal(calls, 1, 'cancellation must prevent fallback provider requests');
});

test('does not accept a provider response body after the owner stop aborts during body parsing', async () => {
  const controller = new AbortController();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    const response = jsonResponse({ choices: [{ message: { content: 'must not be returned' } }] });
    response.json = async () => {
      controller.abort(new Error('owner stop during body read'));
      return { choices: [{ message: { content: 'must not be returned' } }] };
    };
    return response;
  };
  await assert.rejects(() => generateWithModelFallback({
    task: 'chat', prompt: 'hello',
    configuration: { google: { apiKey: 'g-key' }, openai: { apiKey: 'o-key' } },
    fetchImpl: fetchImpl as typeof fetch,
    signal: controller.signal,
  }), /cancelled by emergency stop/);
  assert.equal(calls, 1, 'a cancelled response must not be accepted or trigger provider fallback');
});

test('uses Anthropic Messages response format', async () => {
  let headers: HeadersInit | undefined;
  const result = await generateWithModelFallback({
    task: 'coding', prompt: 'write code', configuration: { anthropic: { apiKey: 'a-key', model: 'claude-test' } },
    fetchImpl: async (_input, init) => {
      headers = init?.headers;
      return jsonResponse({ content: [{ type: 'text', text: 'code' }] });
    },
  });
  assert.equal(result.provider, 'anthropic');
  assert.equal(result.text, 'code');
  assert.equal(new Headers(headers).get('anthropic-version'), '2023-06-01');
});

test('rejects non-loopback local endpoints before making a request', async () => {
  let called = false;
  await assert.rejects(() => generateWithModelFallback({
    task: 'chat', prompt: 'hello',
    configuration: { local: { enabled: true, baseUrl: 'https://example.com' } },
    fetchImpl: async () => { called = true; return jsonResponse({}); },
  }), /All configured model providers failed/);
  assert.equal(called, false);
});

test('rejects empty prompts and unconfigured providers', async () => {
  await assert.rejects(() => generateWithModelFallback({ task: 'chat', prompt: ' ', configuration: {} }), /Prompt/);
  await assert.rejects(() => generateWithModelFallback({ task: 'chat', prompt: 'hello', configuration: {} }), /No model provider/);
});

test('reserves a shared operation slot before every provider fallback attempt', async () => {
  const events: string[] = [];
  let attempt = 0;
  const result = await generateWithModelFallback({
    task: 'chat',
    prompt: 'check fallback accounting',
    ownerUid: 'owner-123',
    configuration: {
      google: { apiKey: 'g-key', model: 'gemini-test' },
      openai: { apiKey: 'o-key', model: 'gpt-test' },
    },
    reserveTokens: async (input) => ({
      ownerUid: input.ownerUid,
      day: '2026-11-27',
      reservedTokens: input.reserveTokens,
      dailyLimitTokens: input.dailyLimitTokens,
    }),
    settleTokens: async () => {},
    reserveOperation: async (ownerUid) => { events.push(`reserve:${ownerUid}`); },
    withExecutionLease: async (work) => { events.push('lease:acquire'); try { return await work(); } finally { events.push('lease:release'); } },
    fetchImpl: async (input) => {
      attempt += 1;
      events.push(`fetch:${String(input).includes('generativelanguage') ? 'google' : 'openai'}`);
      if (attempt === 1) return jsonResponse({ error: 'unavailable' }, 503);
      return jsonResponse({ choices: [{ message: { content: 'fallback ok' } }], usage: { total_tokens: 12 } });
    },
  });
  assert.equal(result.provider, 'openai');
  assert.deepEqual(events, [
    'lease:acquire',
    'reserve:owner-123',
    'fetch:google',
    'lease:release',
    'lease:acquire',
    'reserve:owner-123',
    'fetch:openai',
    'lease:release',
  ]);
});

test('loads provider credentials from server environment names only', () => {
  const config = providerConfigurationFromEnvironment({
    GEMINI_API_KEY: 'g', OPENAI_API_KEY: 'o', ANTHROPIC_API_KEY: 'a',
    JERRY_LOCAL_MODEL_ENABLED: '1', JERRY_LOCAL_MODEL_URL: 'http://127.0.0.1:11434',
  });
  assert.equal(config.google?.apiKey, 'g');
  assert.equal(config.openai?.apiKey, 'o');
  assert.equal(config.anthropic?.apiKey, 'a');
  assert.equal(config.local?.enabled, true);
});

test('reserves and reconciles exact configured model USD cost from provider input/output usage', async () => {
  const previousLimit = process.env.JERRY_DAILY_PROVIDER_COST_LIMIT_MICRO_USD;
  process.env.JERRY_DAILY_PROVIDER_COST_LIMIT_MICRO_USD = '1000000';
  const events: string[] = [];
  try {
    const result = await generateWithModelFallback({
      task: 'chat',
      prompt: 'hello',
      ownerUid: 'owner-cost-test',
      configuration: { openai: { apiKey: 'test-key', model: 'gpt-cost-test' } },
      pricing: {
        'openai/gpt-cost-test': {
          inputMicroUsdPerMillionTokens: 2_000_000,
          outputMicroUsdPerMillionTokens: 8_000_000,
        },
      },
      reserveTokens: async (input) => ({
        ownerUid: input.ownerUid, day: '2026-11-27',
        reservedTokens: input.reserveTokens, dailyLimitTokens: input.dailyLimitTokens,
      }),
      settleTokens: async () => {},
      reserveOperation: async () => {},
      reserveCost: async (input) => {
        events.push(`reserve:${input.reserveMicroUsd}`);
        return {
          reservationId: 'test-cost-reservation', reservationId: 'cost-reservation-test', ownerUid: input.ownerUid, day: '2026-11-27',
          reservedMicroUsd: input.reserveMicroUsd, dailyLimitMicroUsd: input.dailyLimitMicroUsd,
        };
      },
      settleCost: async (_reservation, actual) => { events.push(`settle:${actual}`); },
      withExecutionLease: async (work) => work(),
      fetchImpl: async () => jsonResponse({
        choices: [{ message: { content: 'cost-accounted response' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    });
    assert.equal(result.text, 'cost-accounted response');
    assert.equal(events.length, 2);
    assert.match(events[0], /^reserve:/);
    assert.equal(events[1], 'settle:60');
  } finally {
    if (previousLimit === undefined) delete process.env.JERRY_DAILY_PROVIDER_COST_LIMIT_MICRO_USD;
    else process.env.JERRY_DAILY_PROVIDER_COST_LIMIT_MICRO_USD = previousLimit;
  }
});

test('rejects malformed provider price configuration rather than guessing prices', async () => {
  const { parseProviderPricingFromEnvironment } = await import('./providerAdapters');
  assert.throws(() => parseProviderPricingFromEnvironment('{bad json'), /valid JSON/);
  assert.throws(() => parseProviderPricingFromEnvironment(JSON.stringify({
    'openai/gpt-test': { inputMicroUsdPerMillionTokens: 0, outputMicroUsdPerMillionTokens: 1 },
  })), /positive integer/);
  assert.deepEqual(parseProviderPricingFromEnvironment(JSON.stringify({
    'openai/gpt-test': { inputMicroUsdPerMillionTokens: 1_000_000, outputMicroUsdPerMillionTokens: 2_000_000 },
  })), {
    'openai/gpt-test': { inputMicroUsdPerMillionTokens: 1_000_000, outputMicroUsdPerMillionTokens: 2_000_000 },
  });
});


test('reserves a USD cost ceiling independently for each failed and fallback provider attempt', async () => {
  const previousLimit = process.env.JERRY_DAILY_PROVIDER_COST_LIMIT_MICRO_USD;
  process.env.JERRY_DAILY_PROVIDER_COST_LIMIT_MICRO_USD = '1000000';
  const reservations: number[] = [];
  const settlements: number[] = [];
  let request = 0;
  try {
    const result = await generateWithModelFallback({
      task: 'chat',
      prompt: 'verify cost fallback',
      ownerUid: 'owner-cost-fallback',
      configuration: {
        google: { apiKey: 'google-test', model: 'gemini-cost-test' },
        openai: { apiKey: 'openai-test', model: 'gpt-cost-fallback' },
      },
      pricing: {
        'google/gemini-cost-test': {
          inputMicroUsdPerMillionTokens: 1_000_000,
          outputMicroUsdPerMillionTokens: 2_000_000,
        },
        'openai/gpt-cost-fallback': {
          inputMicroUsdPerMillionTokens: 2_000_000,
          outputMicroUsdPerMillionTokens: 4_000_000,
        },
      },
      reserveTokens: async (input) => ({
        ownerUid: input.ownerUid, day: '2026-11-27',
        reservedTokens: input.reserveTokens, dailyLimitTokens: input.dailyLimitTokens,
      }),
      settleTokens: async () => {},
      reserveOperation: async () => {},
      reserveCost: async (input) => {
        reservations.push(input.reserveMicroUsd);
        return {
          reservationId: `cost-reservation-${reservations.length}`,
          ownerUid: input.ownerUid, day: '2026-11-27',
          reservedMicroUsd: input.reserveMicroUsd, dailyLimitMicroUsd: input.dailyLimitMicroUsd,
        };
      },
      settleCost: async (_reservation, actual) => { settlements.push(actual); },
      withExecutionLease: async (work) => work(),
      fetchImpl: async (url) => {
        request += 1;
        if (request === 1) return jsonResponse({ error: 'provider unavailable' }, 503);
        return jsonResponse({
          choices: [{ message: { content: 'fallback accounted' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        });
      },
    });
    assert.equal(result.provider, 'openai');
    assert.equal(reservations.length, 2, 'the failed first attempt and successful fallback each reserve their own cost ceiling');
    assert.equal(settlements.length, 1, 'only the successful response can reconcile actual cost');
    assert.equal(settlements[0], 50);
  } finally {
    if (previousLimit === undefined) delete process.env.JERRY_DAILY_PROVIDER_COST_LIMIT_MICRO_USD;
    else process.env.JERRY_DAILY_PROVIDER_COST_LIMIT_MICRO_USD = previousLimit;
  }
});
