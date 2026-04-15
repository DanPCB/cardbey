/**
 * Lightweight metrics for store content fix routing.
 * Replace with StatsD / OpenTelemetry when you have a sink.
 */

/**
 * @param {Record<string, unknown>} payload
 */
export function logStoreContentFixLegacyRegexDetector(payload) {
  const line = JSON.stringify({
    metric: 'store_content_fix.legacy_regex_detector',
    ts: new Date().toISOString(),
    ...payload,
  });
  console.info(`[storeContentFixMetrics] ${line}`);
}

/**
 * Intake returned a validated storeContentPatch — proactive-step skipped regex detector.
 * @param {Record<string, unknown>} payload
 */
export function logStoreContentFixIntakeStructured(payload) {
  const line = JSON.stringify({
    metric: 'store_content_fix.intake_structured',
    ts: new Date().toISOString(),
    ...payload,
  });
  console.info(`[storeContentFixMetrics] ${line}`);
}
