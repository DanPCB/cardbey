/**
 * Loyalty topology observability events.
 */

/**
 * @param {string} eventType
 * @param {Record<string, unknown>} [payload]
 */
export function emitLoyaltyTopologyTelemetry(eventType, payload = {}) {
  const entry = {
    event: eventType,
    at: new Date().toISOString(),
    ...payload,
  };
  if (process.env.NODE_ENV !== 'production') {
    console.log('[LoyaltyTopology]', JSON.stringify(entry));
  }
  return entry;
}

/**
 * @param {'NO_TOPOLOGY' | 'LOW_CONFIDENCE' | 'INVALID_STRUCTURE' | 'OWNER_SELECTED_SIMPLIFIED'} reason
 * @param {Record<string, unknown>} [ctx]
 */
export function emitTopologyFallbackUsed(reason, ctx = {}) {
  return emitLoyaltyTopologyTelemetry('loyalty_topology_fallback_used', { reason, ...ctx });
}

export default { emitLoyaltyTopologyTelemetry, emitTopologyFallbackUsed };
