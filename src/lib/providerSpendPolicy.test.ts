import test from 'node:test';
import assert from 'node:assert/strict';
import { assertHostedProviderSpendEnabled } from './providerSpendPolicy';

test('hosted paid services are blocked unless the owner enables them', () => {
  const previous = process.env.JERRY_PAID_SERVICES_ENABLED;
  try {
    delete process.env.JERRY_PAID_SERVICES_ENABLED;
    assert.throws(
      () => assertHostedProviderSpendEnabled('Google Gemini'),
      /disabled.*verified revenue.*explicitly enables paid services/i,
    );
    process.env.JERRY_PAID_SERVICES_ENABLED = '0';
    assert.throws(() => assertHostedProviderSpendEnabled('Tavily'), /Hosted provider spending is disabled/);
    process.env.JERRY_PAID_SERVICES_ENABLED = '1';
    assert.doesNotThrow(() => assertHostedProviderSpendEnabled('Google Gemini'));
  } finally {
    if (previous === undefined) delete process.env.JERRY_PAID_SERVICES_ENABLED;
    else process.env.JERRY_PAID_SERVICES_ENABLED = previous;
  }
});
