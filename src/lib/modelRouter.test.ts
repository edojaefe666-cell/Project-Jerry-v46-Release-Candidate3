import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveModelRoute, type ProviderConfiguration } from './modelRouter';

  const providers: ProviderConfiguration = {
    google: { apiKey: 'server-google-key', model: 'gemini-test' },
    openai: { apiKey: 'server-openai-key', model: 'gpt-test' },
    anthropic: { apiKey: 'server-anthropic-key', model: 'claude-test' },
    local: { enabled: true, baseUrl: 'http://127.0.0.1:11434', model: 'local-test' },
  };

test('selects the coding-specialized provider first', () => {
  assert.deepEqual(resolveModelRoute('coding', providers).map((route) => route.provider), ['anthropic', 'openai', 'google', 'local']);
  });

test('honours an owner preference only when it is suitable for the task', () => {
  assert.equal(resolveModelRoute('planning', providers, 'openai')[0].provider, 'openai');
  assert.equal(resolveModelRoute('vision', providers, 'anthropic')[0].provider, 'google');
  });

test('excludes providers without server credentials', () => {
  assert.deepEqual(resolveModelRoute('chat', { google: { apiKey: '  ' }, openai: { apiKey: 'ok' } }).map((route) => route.provider), ['openai']);
  });

test('excludes local endpoints unless enabled and safely configured', () => {
  assert.deepEqual(resolveModelRoute('chat', { local: { enabled: true, baseUrl: 'javascript:alert(1)' } }), []);
  assert.deepEqual(resolveModelRoute('chat', { local: { enabled: true, baseUrl: 'https://user:pass@example.com' } }), []);
  });

test('never returns provider credential material', () => {
    const routes = resolveModelRoute('chat', providers);
  assert.equal(JSON.stringify(routes).includes('server-google-key'), false);
  assert.equal(JSON.stringify(routes).includes('server-openai-key'), false);
  });

test('returns an empty route list when no provider is configured', () => {
  assert.deepEqual(resolveModelRoute('research', {}), []);
});
