/**
 * PII Guard utilities (Contact Sync MVP)
 * - Do not log raw identifiers (phone/email) or contact names.
 * - Treat hashes as sensitive too (avoid logging them).
 */

export function piiSafeError(message, code = 'bad_request') {
  const m = typeof message === 'string' ? message : 'Request rejected';
  return { ok: false, code, error: code, message: m };
}

export function redactValue(_value) {
  return '[REDACTED]';
}

/**
 * Extremely conservative: detect strings that look like phone/email.
 * Use only in tests/log assertions; do not rely on it for security.
 */
export function looksLikePiiString(s) {
  if (!s || typeof s !== 'string') return false;
  const t = s.trim();
  if (!t) return false;
  const emailLike = /@/.test(t) && /\.[a-z]{2,}$/i.test(t);
  const phoneLike = /^\+?\d[\d\s().-]{6,}\d$/.test(t);
  return emailLike || phoneLike;
}

