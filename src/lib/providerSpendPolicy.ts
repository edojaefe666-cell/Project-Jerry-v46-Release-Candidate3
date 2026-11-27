/**
 * Jerry's pre-revenue spending rule.
 *
 * Hosted AI and research providers can incur charges even when their SDKs
 * expose free quotas. Keep them disabled unless the owner has verified
 * Jerry-generated revenue and explicitly enabled paid services.
 */
export function assertHostedProviderSpendEnabled(service: string): void {
  if (process.env.JERRY_PAID_SERVICES_ENABLED !== '1') {
    throw new Error(
      `Hosted provider spending is disabled for ${service}. Jerry may use local providers and genuinely free paths until the owner verifies Jerry-generated revenue and explicitly enables paid services.`,
    );
  }
}
