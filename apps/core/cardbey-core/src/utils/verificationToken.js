/**
 * Email verification token parsing + hashing (never log full raw token).
 */
import crypto from 'crypto';

/** Normalize token from query/body (trim, decode once, strip email line-wrap spaces). */
export function normalizeVerificationToken(raw) {
  if (raw == null) return null;
  let t = Array.isArray(raw) ? raw[0] : raw;
  if (typeof t !== 'string') t = String(t);
  t = t.trim();
  if (!t) return null;
  if (t.includes('%')) {
    try {
      const decoded = decodeURIComponent(t);
      if (decoded) t = decoded.trim();
    } catch {
      /* keep original */
    }
  }
  return t.replace(/\s+/g, '');
}

/** Hash a raw verification token for DB storage / lookup. */
export function hashVerificationToken(token) {
  const normalized = normalizeVerificationToken(token);
  if (!normalized) return '';
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/** Safe log fields — length + hash prefix only. */
export function verificationConfirmLogFields(token) {
  const normalized = normalizeVerificationToken(token);
  const hashed = normalized ? hashVerificationToken(normalized) : '';
  return {
    tokenLength: normalized ? normalized.length : 0,
    hashPrefix: hashed ? `${hashed.slice(0, 10)}…` : null,
  };
}
