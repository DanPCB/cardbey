/**
 * Structured discovery provider events — JSON logs for operator diagnostics.
 */

export type DiscoveryProviderLogEvent =
  | 'discovery_provider_rate_limited'
  | 'discovery_provider_retry'
  | 'discovery_provider_cache_hit'
  | 'discovery_provider_fallback'
  | 'discovery_batch_partial_success';

export function logDiscoveryProviderEvent(
  event: DiscoveryProviderLogEvent,
  payload: Record<string, unknown>,
): void {
  const line = JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    ...payload,
  });
  console.info(`[discovery] ${line}`);
}
