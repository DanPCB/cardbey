/**
 * Canonical intent shape for executeIntent (Phase 0 — normalization only).
 */

/**
 * @typedef {'chat'|'performer'|'dashboard'|'api'|'system'} IntentSource
 */

/**
 * @param {object} raw
 * @param {IntentSource} [raw.source]
 * @param {string} [raw.rawInput]
 * @param {string|null} [raw.normalizedIntentType]
 * @param {Record<string, unknown>} [raw.entities]
 * @param {object} [raw.context]
 * @param {string|null} [raw.correlationId]
 * @returns {{
 *   source: IntentSource,
 *   rawInput: string,
 *   normalizedIntentType: string|null,
 *   entities: Record<string, unknown>,
 *   context: Record<string, unknown>,
 *   correlationId: string|null,
 * }}
 */
export function normalizeCanonicalIntent(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const allowed = new Set(['chat', 'performer', 'dashboard', 'api', 'system']);
  const src = typeof r.source === 'string' && allowed.has(r.source) ? r.source : 'system';
  const rawInput = typeof r.rawInput === 'string' ? r.rawInput.trim() : String(r.rawInput ?? '').trim();
  const normalizedIntentType =
    typeof r.normalizedIntentType === 'string' && r.normalizedIntentType.trim()
      ? r.normalizedIntentType.trim()
      : null;
  const entities =
    r.entities && typeof r.entities === 'object' && !Array.isArray(r.entities) ? { ...r.entities } : {};
  const context =
    r.context && typeof r.context === 'object' && !Array.isArray(r.context) ? { ...r.context } : {};
  const correlationId =
    typeof r.correlationId === 'string' && r.correlationId.trim() ? r.correlationId.trim() : null;
  return {
    source: /** @type {IntentSource} */ (src),
    rawInput,
    normalizedIntentType,
    entities,
    context,
    correlationId,
  };
}
