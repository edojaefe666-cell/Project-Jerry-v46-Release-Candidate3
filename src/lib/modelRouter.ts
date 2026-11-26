/**
 * Provider-neutral model routing policy.
 *
 * This module selects only providers whose server-side credentials are present.
 * It never exposes credential values and never implies a model call occurred.
 * Provider adapters are registered separately by the server integration layer.
 */
export type ModelProvider = 'google' | 'openai' | 'anthropic' | 'local';
export type ModelTask = 'chat' | 'planning' | 'research' | 'coding' | 'vision' | 'speech' | 'transcription';

export interface ProviderConfiguration {
  google?: { apiKey?: string; model?: string };
  openai?: { apiKey?: string; model?: string };
  anthropic?: { apiKey?: string; model?: string };
  local?: { enabled?: boolean; model?: string; baseUrl?: string };
}

export interface ModelRoute {
  provider: ModelProvider;
  model: string;
  reason: string;
}

const TASK_PREFERENCE: Record<ModelTask, ModelProvider[]> = {
  chat: ['google', 'openai', 'anthropic', 'local'],
  planning: ['google', 'anthropic', 'openai', 'local'],
  research: ['google', 'openai', 'anthropic', 'local'],
  coding: ['anthropic', 'openai', 'google', 'local'],
  vision: ['google', 'openai'],
  speech: ['google', 'openai'],
  transcription: ['google', 'openai'],
};

const DEFAULT_MODELS: Record<ModelProvider, string> = {
  google: 'gemini-2.5-flash',
  openai: 'gpt-4.1-mini',
  anthropic: 'claude-sonnet',
  local: 'local-default',
};

function configuredModel(
  provider: ModelProvider,
  configuration: ProviderConfiguration
): string | null {
  if (provider === 'google') {
    const value = configuration.google;
    return value?.apiKey?.trim() ? (value.model?.trim() || DEFAULT_MODELS.google) : null;
  }
  if (provider === 'openai') {
    const value = configuration.openai;
    return value?.apiKey?.trim() ? (value.model?.trim() || DEFAULT_MODELS.openai) : null;
  }
  if (provider === 'anthropic') {
    const value = configuration.anthropic;
    return value?.apiKey?.trim() ? (value.model?.trim() || DEFAULT_MODELS.anthropic) : null;
  }
  const value = configuration.local;
  if (!value?.enabled || !value.baseUrl?.trim()) return null;
  try {
    const url = new URL(value.baseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
  } catch {
    return null;
  }
  return value.model?.trim() || DEFAULT_MODELS.local;
}

export function resolveModelRoute(
  task: ModelTask,
  configuration: ProviderConfiguration,
  preferredProvider?: ModelProvider
): ModelRoute[] {
  const preference = TASK_PREFERENCE[task];
  const order = preferredProvider && preference.includes(preferredProvider)
    ? [preferredProvider, ...preference.filter((provider) => provider !== preferredProvider)]
    : preference;

  return order.flatMap((provider) => {
    const model = configuredModel(provider, configuration);
    return model
      ? [{ provider, model, reason: preferredProvider === provider ? 'Owner-configured preference' : `Task suitability: ${task}` }]
      : [];
  });
}
