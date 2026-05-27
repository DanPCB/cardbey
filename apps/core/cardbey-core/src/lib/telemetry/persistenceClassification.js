/**
 * Runtime persistence categories — guides write scheduling and failure handling.
 *
 * - realtime_critical: must land before user-visible continuation (mission context, blackboard rows)
 * - eventual: safe to batch / retry (non-blocking mirrors)
 * - diagnostic: telemetry probes; never on hot read paths; debounced + fire-and-forget
 * - ephemeral: in-memory / SSE only; no durable write required
 */

export const PERSISTENCE_CATEGORY = {
  REALTIME_CRITICAL: 'realtime_critical',
  EVENTUAL: 'eventual',
  DIAGNOSTIC: 'diagnostic',
  EPHEMERAL: 'ephemeral',
};

/** @type {Record<string, keyof typeof PERSISTENCE_CATEGORY>} */
const TAG_CATEGORY = {
  reasoning_log_polled: PERSISTENCE_CATEGORY.DIAGNOSTIC,
  reasoning_line_written: PERSISTENCE_CATEGORY.DIAGNOSTIC,
  'broker.execution': PERSISTENCE_CATEGORY.DIAGNOSTIC,
  orchestra_mirror: PERSISTENCE_CATEGORY.EVENTUAL,
  content_resolved: PERSISTENCE_CATEGORY.EVENTUAL,
  performer_runtime_dry_run: PERSISTENCE_CATEGORY.DIAGNOSTIC,
};

/**
 * @param {string} tag
 * @returns {string}
 */
export function classifyTelemetryTag(tag) {
  const t = typeof tag === 'string' ? tag.trim() : '';
  return TAG_CATEGORY[t] ?? PERSISTENCE_CATEGORY.DIAGNOSTIC;
}

export function isDiagnosticTelemetryTag(tag) {
  return classifyTelemetryTag(tag) === PERSISTENCE_CATEGORY.DIAGNOSTIC;
}
