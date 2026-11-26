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
