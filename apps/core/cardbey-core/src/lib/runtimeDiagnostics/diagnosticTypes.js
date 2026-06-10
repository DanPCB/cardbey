/** @typedef {'frontend'|'backend'|'device'|'worker'} DiagnosticSource */
/** @typedef {'info'|'warning'|'error'|'critical'} DiagnosticSeverity */
/** @typedef {'media'|'network'|'auth'|'storage'|'render'|'deployment'|'mission'|'unknown'} DiagnosticCategory */

export const DIAGNOSTIC_SOURCES = new Set(['frontend', 'backend', 'device', 'worker']);
export const DIAGNOSTIC_SEVERITIES = new Set(['info', 'warning', 'error', 'critical']);
export const DIAGNOSTIC_CATEGORIES = new Set([
  'media',
  'network',
  'auth',
  'storage',
  'render',
  'deployment',
  'mission',
  'unknown',
]);

export const MAX_BREADCRUMBS = 50;
export const MAX_EVIDENCE_JSON_BYTES = 32_000;
export const MAX_MESSAGE_LENGTH = 2_000;
export const MAX_RECENT_BUFFER = 500;

/**
 * @param {unknown} value
 * @returns {string}
 */
export function trimStr(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

/**
 * @param {unknown} body
 * @returns {{ ok: true, payload: Record<string, unknown> } | { ok: false, error: string }}
 */
export function parseDiagnosticIngestBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'body must be a JSON object' };
  }

  const source = trimStr(body.source) || 'frontend';
  const severity = trimStr(body.severity) || 'error';
  const category = trimStr(body.category) || 'unknown';
  const eventName = trimStr(body.eventName);
  const message = trimStr(body.message);

  if (!DIAGNOSTIC_SOURCES.has(source)) {
    return { ok: false, error: 'invalid source' };
  }
  if (!DIAGNOSTIC_SEVERITIES.has(severity)) {
    return { ok: false, error: 'invalid severity' };
  }
  if (!DIAGNOSTIC_CATEGORIES.has(category)) {
    return { ok: false, error: 'invalid category' };
  }
  if (!eventName) {
    return { ok: false, error: 'eventName is required' };
  }
  if (!message) {
    return { ok: false, error: 'message is required' };
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, error: 'message too long' };
  }

  const deployment =
    body.deployment && typeof body.deployment === 'object' && !Array.isArray(body.deployment)
      ? body.deployment
      : {};
  const browser =
    body.browser && typeof body.browser === 'object' && !Array.isArray(body.browser)
      ? body.browser
      : {};
  const evidence =
    body.evidence && typeof body.evidence === 'object' && !Array.isArray(body.evidence)
      ? body.evidence
      : {};
  const rawError =
    body.rawError && typeof body.rawError === 'object' && !Array.isArray(body.rawError)
      ? body.rawError
      : {};
  const breadcrumbs = Array.isArray(body.breadcrumbs) ? body.breadcrumbs.slice(0, MAX_BREADCRUMBS) : [];

  return {
    ok: true,
    payload: {
      source,
      severity,
      category,
      eventName,
      message,
      route: trimStr(body.route) || null,
      userId: trimStr(body.userId) || null,
      storeId: trimStr(body.storeId) || null,
      draftId: trimStr(body.draftId) || null,
      missionId: trimStr(body.missionId) || null,
      generationRunId: trimStr(body.generationRunId) || null,
      deployment,
      browser,
      evidence,
      breadcrumbs,
      rawError,
    },
  };
}
