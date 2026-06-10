import { MAX_EVIDENCE_JSON_BYTES, MAX_MESSAGE_LENGTH } from './diagnosticTypes.js';

const SECRET_KEY_RE =
  /^(authorization|cookie|set-cookie|x-api-key|x-auth-token|access[_-]?token|refresh[_-]?token|password|secret|signature|signedurl|presigned)$/i;

const SECRET_VALUE_RE =
  /(bearer\s+[a-z0-9._-]+|sk-[a-z0-9]+|AKIA[A-Z0-9]{16}|eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)/i;

const QUERY_ALLOWLIST = new Set(['v', 'retry', '_retry']);

/**
 * @param {string} url
 * @returns {string}
 */
export function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim().slice(0, 500);
  if (trimmed.startsWith('blob:') || trimmed.startsWith('data:')) return trimmed.slice(0, 120);

  try {
    const parsed = new URL(trimmed);
    const kept = new URLSearchParams();
    for (const [key, value] of parsed.searchParams.entries()) {
      if (QUERY_ALLOWLIST.has(key)) kept.set(key, value.slice(0, 32));
    }
    parsed.search = kept.toString() ? `?${kept.toString()}` : '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return trimmed.split('?')[0].slice(0, 200);
  }
}

/**
 * @param {unknown} value
 * @param {number} depth
 * @returns {unknown}
 */
export function sanitizeValue(value, depth = 0) {
  if (depth > 6) return '[truncated-depth]';
  if (value == null) return value;
  if (typeof value === 'string') {
    if (SECRET_VALUE_RE.test(value)) return '[redacted]';
    if (value.length > 2_000) return `${value.slice(0, 2_000)}…`;
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.slice(0, 40).map((item) => sanitizeValue(item, depth + 1));
  }
  if (typeof value === 'object') {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const [key, raw] of Object.entries(value)) {
      if (SECRET_KEY_RE.test(key)) {
        out[key] = '[redacted]';
        continue;
      }
      if (typeof raw === 'string' && /url$/i.test(key)) {
        out[key] = sanitizeUrl(raw);
        continue;
      }
      out[key] = sanitizeValue(raw, depth + 1);
    }
    return out;
  }
  return String(value).slice(0, 200);
}

/**
 * @param {Record<string, unknown>} payload
 * @param {{ authenticated: boolean }} opts
 * @returns {Record<string, unknown>}
 */
export function sanitizeDiagnosticPayload(payload, opts = { authenticated: false }) {
  const sanitized = {
    source: payload.source,
    severity: payload.severity,
    category: payload.category,
    eventName: payload.eventName,
    message: String(payload.message || '').slice(0, MAX_MESSAGE_LENGTH),
    route: payload.route ? sanitizeUrl(String(payload.route)) : null,
    storeId: payload.storeId ?? null,
    draftId: payload.draftId ?? null,
    missionId: payload.missionId ?? null,
    generationRunId: payload.generationRunId ?? null,
    deployment: sanitizeValue(payload.deployment),
    browser: sanitizeValue(payload.browser),
    evidence: sanitizeValue(payload.evidence),
    breadcrumbs: sanitizeValue(payload.breadcrumbs),
    rawError: sanitizeValue(payload.rawError),
  };

  if (opts.authenticated && payload.userId) {
    sanitized.userId = String(payload.userId).slice(0, 64);
  }

  const json = JSON.stringify(sanitized);
  if (json.length > MAX_EVIDENCE_JSON_BYTES) {
    sanitized.evidence = { truncated: true, preview: json.slice(0, 1_500) };
    sanitized.breadcrumbs = Array.isArray(sanitized.breadcrumbs)
      ? sanitized.breadcrumbs.slice(0, 10)
      : [];
    sanitized.rawError = { truncated: true };
  }

  return sanitized;
}
