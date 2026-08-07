/**
 * Shadow telemetry for auto language resolution (privacy-safe fields only).
 */

/** @type {Array<Record<string, unknown>>} */
const events = [];
const MAX = 500;

/**
 * @param {string} eventName
 * @param {Record<string, unknown>} fields
 */
export function emitLanguageShadowTelemetry(eventName, fields = {}) {
  const safe = Object.freeze({
    event: String(eventName),
    timestamp: new Date().toISOString(),
    context: fields.context ?? null,
    selectedLanguage: fields.selectedLanguage ?? null,
    interfaceLanguage: fields.interfaceLanguage ?? null,
    regionalLocale: fields.regionalLocale ?? null,
    source: fields.source ?? null,
    confidence: fields.confidence ?? null,
    reasonCode: fields.reasonCode ?? null,
    usedFallback: Boolean(fields.usedFallback),
    authenticated: Boolean(fields.authenticated),
    mode: fields.mode ?? null,
    supportedExactMatch: fields.supportedExactMatch ?? null,
  });
  events.push(safe);
  if (events.length > MAX) events.splice(0, events.length - MAX);
  if (process.env.NODE_ENV !== 'production' && process.env.LANGUAGE_SHADOW_LOG === 'true') {
    console.log('[language.shadow]', JSON.stringify(safe));
  }
  return safe;
}

/**
 * @param {number} [limit]
 */
export function listLanguageShadowTelemetry(limit = 50) {
  return Object.freeze(events.slice(-Math.min(Math.max(limit, 1), 200)));
}

/** @internal */
export function __resetLanguageShadowTelemetryForTests() {
  events.length = 0;
}
