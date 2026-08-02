/**
 * Structured telemetry for Projection Renderer Cutover V1.
 */

/**
 * @param {string} event
 * @param {Record<string, unknown>} [payload]
 */
function emit(event, payload = {}) {
  const body = {
    event,
    ts: new Date().toISOString(),
    authoritative: false,
    ...payload,
  };
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[storefrontDesignLibrary.renderCutover] ${event}`, body);
  }
  return Object.freeze(body);
}

/**
 * @param {{
 *   draftStoreId?: string|null,
 *   primarySource: string,
 *   reason: string,
 *   fingerprint?: string|null,
 *   blueprintId?: string|null,
 * }} input
 */
export function emitRenderSourceSelected(input) {
  return emit('storefront.render_source.selected', {
    draftStoreId: input.draftStoreId ?? null,
    primarySource: input.primarySource,
    reason: input.reason,
    fingerprint: input.fingerprint ?? null,
    blueprintId: input.blueprintId ?? null,
  });
}

/**
 * @param {{
 *   draftStoreId?: string|null,
 *   sectionCount?: number,
 *   primaryAction?: string|null,
 *   businessModel?: string|null,
 *   fingerprint?: string|null,
 * }} input
 */
export function emitProjectionRenderCompleted(input) {
  return emit('storefront.projection_render.completed', {
    draftStoreId: input.draftStoreId ?? null,
    sectionCount: input.sectionCount ?? 0,
    primaryAction: input.primaryAction ?? null,
    businessModel: input.businessModel ?? null,
    fingerprint: input.fingerprint ?? null,
  });
}

/**
 * @param {{
 *   draftStoreId?: string|null,
 *   reason: string,
 *   detail?: string|null,
 *   fingerprint?: string|null,
 * }} input
 */
export function emitProjectionRenderFallback(input) {
  return emit('storefront.projection_render.fallback', {
    draftStoreId: input.draftStoreId ?? null,
    reason: input.reason,
    detail: input.detail ?? null,
    fingerprint: input.fingerprint ?? null,
  });
}
