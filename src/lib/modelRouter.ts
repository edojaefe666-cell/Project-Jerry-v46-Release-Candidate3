/**
 * Provider-neutral model routing policy.
 *
 * The catalogue is the single source of truth for provider identity, default
 * model and task capabilities. Credentials remain server-side; this module
 * returns routes only and never exposes credential values.
 */
import {
  MODEL_PROVIDER_REGISTRY,
  providerSupportsTask,
  type ModelProvider,
  type RegisteredModelTask,
} from './providerRegistry';

export type { ModelProvider } from './providerRegistry';
export type ModelTask = RegisteredModelTask;

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

function configuredModel(
  provider: ModelProvider,
  configuration: ProviderConfiguration
): string | null {
  const defaults = MODEL_PROVIDER_REGISTRY[provider];
  if (provider === 'google') {
    const value = configuration.google;
    return value?.apiKey?.trim() ? (value.model?.trim() || defaults.defaultModel) : null;
  }
  if (provider === 'openai') {
    const value = configuration.openai;
    return value?.apiKey?.trim() ? (value.model?.trim() || defaults.defaultModel) : null;
  }
  if (provider === 'anthropic') {
    const value = configuration.anthropic;
    return value?.apiKey?.trim() ? (value.model?.trim() || defaults.defaultModel) : null;
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
  return value.model?.trim() || defaults.defaultModel;
}

export function resolveModelRoute(
  task: ModelTask,
  configuration: ProviderConfiguration,
  preferredProvider?: ModelProvider
): ModelRoute[] {
  const preference = TASK_PREFERENCE[task].filter((provider) => providerSupportsTask(provider, task));
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
