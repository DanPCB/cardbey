/**
 * Performer grounding telemetry — no sensitive raw source content.
 */

const listeners = [];

/**
 * @param {(event: { type: string; payload: Record<string, unknown> }) => void} fn
 */
export function onGroundingTelemetry(fn) {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

/**
 * @param {string} type
 * @param {Record<string, unknown>} payload
 */
export function emitGroundingTelemetry(type, payload = {}) {
  const event = {
    type,
    payload: {
      ...payload,
      timestamp: new Date().toISOString(),
    },
  };
  for (const fn of listeners) {
    try {
      fn(event);
    } catch {
      /* non-fatal */
    }
  }
  if (process.env.NODE_ENV !== 'production') {
    console.info('[performer.grounding]', JSON.stringify({ type, ...payload }));
  }
}

export const GROUNDING_TELEMETRY = {
  STARTED: 'performer_grounding_started',
  SOURCE_MATCHED: 'performer_source_matched',
  SOURCE_REJECTED: 'performer_source_rejected',
  CONTENT_EXTRACTED: 'performer_content_extracted',
  CONTENT_INFERRED: 'performer_content_inferred',
  FALLBACK_USED: 'performer_fallback_used',
  CONFLICT_DETECTED: 'performer_conflict_detected',
  OWNER_REVIEWED: 'performer_owner_reviewed',
  PUBLISHED: 'performer_grounded_output_published',
};

export default { emitGroundingTelemetry, onGroundingTelemetry, GROUNDING_TELEMETRY };
