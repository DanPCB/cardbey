const SECRET_KEY_RE =
  /^(authorization|cookie|set-cookie|x-api-key|x-auth-token|access[_-]?token|refresh[_-]?token|password|secret|signature|signedurl|presigned|otp|verificationtoken)$/i;

const SECRET_VALUE_RE =
  /(bearer\s+[a-z0-9._-]+|sk-[a-z0-9]+|AKIA[A-Z0-9]{16}|eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)/i;

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/g;

/**
 * @param {unknown} value
 * @param {number} depth
 * @returns {unknown}
 */
export function sanitizeValue(value, depth = 0) {
  if (depth > 5) return '[truncated]';
  if (value == null) return value;
  if (typeof value === 'string') {
    if (SECRET_VALUE_RE.test(value)) return '[redacted]';
    let out = value.replace(EMAIL_RE, '[email]').replace(PHONE_RE, '[phone]');
    if (out.length > 500) out = `${out.slice(0, 500)}…`;
    return out;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeValue(item, depth + 1));
  }
  if (typeof value === 'object') {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const [key, raw] of Object.entries(value)) {
      if (SECRET_KEY_RE.test(key)) {
        out[key] = '[redacted]';
        continue;
      }
      out[key] = sanitizeValue(raw, depth + 1);
    }
    return out;
  }
  return String(value).slice(0, 200);
}

/**
 * @param {Record<string, unknown>} input
 * @returns {Record<string, unknown>}
 */
export function sanitizePlatformActivityInput(input) {
  const title = sanitizeValue(String(input.title ?? 'Platform activity').trim()) || 'Platform activity';
  const message = sanitizeValue(String(input.message ?? '').trim()) || '';
  const actorId = input.actorId != null ? String(sanitizeValue(input.actorId)) : null;
  const entityId = input.entityId != null ? String(sanitizeValue(input.entityId)) : null;
  const route = input.route != null ? String(sanitizeValue(input.route)).slice(0, 200) : null;
  const region = input.region != null ? String(sanitizeValue(input.region)).slice(0, 80) : null;
  const metadata =
    input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
      ? /** @type {Record<string, unknown>} */ (sanitizeValue(input.metadata))
      : {};

  return {
    type: String(input.type ?? 'unknown').slice(0, 80),
    category: input.category != null ? String(input.category).slice(0, 40) : '',
    severity: input.severity,
    actorType: input.actorType,
    actorId,
    entityType: input.entityType != null ? String(input.entityType).slice(0, 40) : null,
    entityId,
    title,
    message,
    route,
    actionLabel: input.actionLabel != null ? String(sanitizeValue(input.actionLabel)).slice(0, 80) : '',
    region,
    metadata,
  };
}

/**
 * Strip sensitive fields from a stored event before API response.
 * @param {import('./platformActivityTypes.js').PlatformActivityEvent} event
 */
export function sanitizePlatformActivityEvent(event) {
  return /** @type {import('./platformActivityTypes.js').PlatformActivityEvent} */ ({
    ...event,
    title: String(sanitizeValue(event.title)),
    message: String(sanitizeValue(event.message)),
    actorId: event.actorId ? String(sanitizeValue(event.actorId)) : null,
    entityId: event.entityId ? String(sanitizeValue(event.entityId)) : null,
    route: event.route ? String(sanitizeValue(event.route)) : null,
    actionLabel: event.actionLabel ? String(sanitizeValue(event.actionLabel)) : null,
    region: event.region ? String(sanitizeValue(event.region)) : null,
    metadata: sanitizeValue(event.metadata ?? {}),
  });
}
