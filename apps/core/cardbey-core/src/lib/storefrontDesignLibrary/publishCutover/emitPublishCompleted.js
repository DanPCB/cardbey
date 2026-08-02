/**
 * Lightweight publish completion diagnostic (Phase 8B).
 */

/**
 * @param {{
 *   source: 'legacy'|'projection',
 *   draftId?: string|null,
 *   storeId?: string|null,
 *   blueprintId?: string|null,
 *   projectionFingerprint?: string|null,
 *   acceptanceFingerprint?: string|null,
 *   publishDurationMs?: number|null,
 *   fallbackReason?: string|null,
 * }} payload
 */
export function emitStorefrontPublishCompleted(payload) {
  const event = {
    event: 'storefront.publish.completed',
    source: payload.source === 'projection' ? 'projection' : 'legacy',
    draftId: payload.draftId ?? null,
    storeId: payload.storeId ?? null,
    blueprintId: payload.blueprintId ?? null,
    projectionFingerprint: payload.projectionFingerprint ?? null,
    acceptanceFingerprint: payload.acceptanceFingerprint ?? null,
    publishDurationMs: payload.publishDurationMs ?? null,
    fallbackReason: payload.fallbackReason ?? null,
    authoritative: false,
  };
  if (process.env.NODE_ENV !== 'production' || process.env.DESIGN_LIBRARY_POLICY_LOG === '1') {
    try {
      console.info('[storefrontDesignLibrary]', JSON.stringify(event));
    } catch {
      /* ignore */
    }
  }
  return event;
}
