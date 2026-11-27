/**
 * Canonical server-side provider catalogue.
 *
 * This is deliberately separate from Android/UI code. Model changes within an
 * installed provider are configuration-only; adding a wholly new provider
 * requires a server adapter and its contract tests, but does not require an
 * Android application rewrite.
 */
export const MODEL_PROVIDER_REGISTRY = {
  google: {
    kind: 'hosted',
    defaultModel: 'gemini-2.5-flash',
    tasks: ['chat', 'planning', 'research', 'coding', 'vision', 'speech', 'transcription'],
  },
  openai: {
    kind: 'hosted',
    defaultModel: 'gpt-4.1-mini',
    tasks: ['chat', 'planning', 'research', 'coding', 'vision', 'speech', 'transcription'],
  },
  anthropic: {
    kind: 'hosted',
    defaultModel: 'claude-sonnet',
    tasks: ['chat', 'planning', 'research', 'coding'],
  },
  local: {
    kind: 'local',
    defaultModel: 'local-default',
    tasks: ['chat', 'planning', 'research', 'coding'],
  },
} as const;

export type ModelProvider = keyof typeof MODEL_PROVIDER_REGISTRY;
export type RegisteredModelTask =
  | 'chat'
  | 'planning'
  | 'research'
  | 'coding'
  | 'vision'
  | 'speech'
  | 'transcription';

export function providerSupportsTask(provider: ModelProvider, task: RegisteredModelTask): boolean {
  return (MODEL_PROVIDER_REGISTRY[provider].tasks as readonly string[]).includes(task);
}
