import test from 'node:test';
import assert from 'node:assert/strict';
import { MODEL_PROVIDER_REGISTRY, providerSupportsTask } from './providerRegistry';

test('catalogue exposes the supported server providers and their deployment class', () => {
  assert.deepEqual(Object.keys(MODEL_PROVIDER_REGISTRY).sort(), ['anthropic', 'google', 'local', 'openai']);
  assert.equal(MODEL_PROVIDER_REGISTRY.google.kind, 'hosted');
  assert.equal(MODEL_PROVIDER_REGISTRY.local.kind, 'local');
});

test('provider capabilities prevent unsupported task routes', () => {
  assert.equal(providerSupportsTask('google', 'vision'), true);
  assert.equal(providerSupportsTask('openai', 'transcription'), true);
  assert.equal(providerSupportsTask('anthropic', 'vision'), false);
  assert.equal(providerSupportsTask('local', 'speech'), false);
});

test('each provider has an explicit default model and supported task list', () => {
  for (const entry of Object.values(MODEL_PROVIDER_REGISTRY)) {
    assert.ok(entry.defaultModel.length > 0);
    assert.ok(entry.tasks.length > 0);
  }
});
