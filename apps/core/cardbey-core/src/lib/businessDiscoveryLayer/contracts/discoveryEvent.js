/**
 * Discovery event contracts — consumers subscribe; producers emit via the BDL bus.
 */

export const DISCOVERY_EVENT_TYPES = Object.freeze({
  GENERATED: 'business.discovery.generated',
  UPDATED: 'business.discovery.updated',
  INVALIDATED: 'business.discovery.invalidated',
  PUBLISHED: 'business.discovery.published',
});

export const DISCOVERY_EVENT_TYPE_LIST = Object.freeze(Object.values(DISCOVERY_EVENT_TYPES));

/**
 * @typedef {Object} DiscoveryEvent
 * @property {string} type
 * @property {string} businessId
 * @property {string|null} slug
 * @property {string} projectionId
 * @property {string} occurredAt
 * @property {string|null} reason
 * @property {Record<string, unknown>} payload
 */

/**
 * @param {object} params
 * @param {string} params.type
 * @param {string} params.businessId
 * @param {string|null} [params.slug]
 * @param {string} [params.projectionId]
 * @param {string|null} [params.reason]
 * @param {Record<string, unknown>} [params.payload]
 * @returns {DiscoveryEvent}
 */
export function buildDiscoveryEvent({
  type,
  businessId,
  slug = null,
  projectionId = null,
  reason = null,
  payload = {},
}) {
  if (!DISCOVERY_EVENT_TYPE_LIST.includes(type)) {
    throw new Error(`[businessDiscoveryLayer] Unknown discovery event type: ${String(type)}`);
  }
  if (typeof businessId !== 'string' || !businessId.trim()) {
    throw new Error('[businessDiscoveryLayer] DiscoveryEvent.businessId required');
  }
  return Object.freeze({
    type,
    businessId: businessId.trim(),
    slug: typeof slug === 'string' && slug.trim() ? slug.trim() : null,
    projectionId:
      typeof projectionId === 'string' && projectionId.trim()
        ? projectionId.trim()
        : `bdl_${businessId.trim()}`,
    occurredAt: new Date().toISOString(),
    reason: typeof reason === 'string' && reason.trim() ? reason.trim() : null,
    payload: Object.freeze({ ...(payload && typeof payload === 'object' ? payload : {}) }),
  });
}

/**
 * @param {unknown} value
 * @returns {DiscoveryEvent}
 */
export function assertDiscoveryEvent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('[businessDiscoveryLayer] Invalid DiscoveryEvent');
  }
  const v = /** @type {Record<string, unknown>} */ (value);
  if (!DISCOVERY_EVENT_TYPE_LIST.includes(/** @type {string} */ (v.type))) {
    throw new Error(`[businessDiscoveryLayer] Invalid DiscoveryEvent.type: ${String(v.type)}`);
  }
  if (typeof v.businessId !== 'string' || !v.businessId.trim()) {
    throw new Error('[businessDiscoveryLayer] DiscoveryEvent.businessId required');
  }
  if (typeof v.occurredAt !== 'string' || !v.occurredAt.trim()) {
    throw new Error('[businessDiscoveryLayer] DiscoveryEvent.occurredAt required');
  }
  return /** @type {DiscoveryEvent} */ (value);
}
