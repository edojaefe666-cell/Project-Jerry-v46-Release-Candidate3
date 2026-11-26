import { describe, expect, it } from 'vitest';
import { resolveModelRoute, type ProviderConfiguration } from './modelRouter';

describe('resolveModelRoute', () => {
  const providers: ProviderConfiguration = {
    google: { apiKey: 'server-google-key', model: 'gemini-test' },
    openai: { apiKey: 'server-openai-key', model: 'gpt-test' },
    anthropic: { apiKey: 'server-anthropic-key', model: 'claude-test' },
    local: { enabled: true, baseUrl: 'http://127.0.0.1:11434', model: 'local-test' },
  };

  it('selects the coding-specialized provider first', () => {
    expect(resolveModelRoute('coding', providers).map((route) => route.provider))
      .toEqual(['anthropic', 'openai', 'google', 'local']);
  });

  it('honours an owner preference only when it is suitable for the task', () => {
    expect(resolveModelRoute('planning', providers, 'openai')[0].provider).toBe('openai');
    expect(resolveModelRoute('vision', providers, 'anthropic')[0].provider).toBe('google');
  });

  it('excludes providers without server credentials', () => {
    expect(resolveModelRoute('chat', { google: { apiKey: '  ' }, openai: { apiKey: 'ok' } })
      .map((route) => route.provider)).toEqual(['openai']);
  });

  it('excludes local endpoints unless enabled and safely configured', () => {
    expect(resolveModelRoute('chat', { local: { enabled: true, baseUrl: 'javascript:alert(1)' } }))
      .toEqual([]);
    expect(resolveModelRoute('chat', { local: { enabled: true, baseUrl: 'https://user:pass@example.com' } }))
      .toEqual([]);
  });

  it('never returns provider credential material', () => {
    const routes = resolveModelRoute('chat', providers);
    expect(JSON.stringify(routes)).not.toContain('server-google-key');
    expect(JSON.stringify(routes)).not.toContain('server-openai-key');
  });

  it('returns an empty route list when no provider is configured', () => {
    expect(resolveModelRoute('research', {})).toEqual([]);
  });
});
