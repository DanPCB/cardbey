/**
 * CTA analytics event shapes + pluggable sink (in-memory default).
 */

/** @typedef {'impression'|'visible'|'click'|'dismiss'|'conversion'|'activation'} CtaAnalyticsEventType */

/**
 * @typedef {object} CtaAnalyticsEvent
 * @property {CtaAnalyticsEventType} type
 * @property {string} [capabilityId]
 * @property {string} [variantId]
 * @property {string} [analyticsId]
 * @property {string} [placement]
 * @property {number} [scrollRatio]
 * @property {number} [visibilityMs]
 * @property {string} [storeId]
 * @property {string} [missionId]
 * @property {string} [surface]
 * @property {number} timestamp
 * @property {Record<string, unknown>} [meta]
 */

/** @type {CtaAnalyticsEvent[]} */
const buffer = [];
/** @type {((e: CtaAnalyticsEvent) => void) | null} */
let sink = null;

/**
 * @param {(e: CtaAnalyticsEvent) => void} fn
 */
export function setCtaAnalyticsSink(fn) {
  sink = typeof fn === 'function' ? fn : null;
}

/**
 * @param {Omit<CtaAnalyticsEvent, 'timestamp'> & { timestamp?: number }} partial
 */
export function recordCtaEvent(partial) {
  /** @type {CtaAnalyticsEvent} */
  const event = {
    ...partial,
    timestamp: partial.timestamp ?? Date.now(),
  };
  buffer.push(event);
  if (buffer.length > 500) buffer.shift();
  try {
    sink?.(event);
  } catch {
    /* never break CTA path for analytics */
  }
  return event;
}

export function recordImpression(payload) {
  return recordCtaEvent({ type: 'impression', ...payload });
}

export function recordInteraction(payload) {
  return recordCtaEvent({ type: 'click', ...payload });
}

export function recordConversion(payload) {
  return recordCtaEvent({ type: 'conversion', ...payload });
}

export function recordDismiss(payload) {
  return recordCtaEvent({ type: 'dismiss', ...payload });
}

/** @internal */
export function _drainAnalyticsForTests() {
  const copy = [...buffer];
  buffer.length = 0;
  return copy;
}
