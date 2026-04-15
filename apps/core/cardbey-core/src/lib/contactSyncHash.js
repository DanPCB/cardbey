import crypto from 'crypto';

const HASH_VERSION = 'v1';

function requireSecret() {
  const secret = (process.env.CONTACT_SYNC_HMAC_SECRET || '').trim();
  if (!secret) {
    // Do not include env var value in error
    throw new Error('CONTACT_SYNC_HMAC_SECRET is not set');
  }
  return secret;
}

export function isContactSyncHashConfigured() {
  return Boolean((process.env.CONTACT_SYNC_HMAC_SECRET || '').trim());
}

export function getContactSyncHashVersion() {
  return HASH_VERSION;
}

export function canonicalizeEmail(input) {
  if (typeof input !== 'string') return null;
  const email = input.trim().toLowerCase();
  if (!email) return null;
  // Minimal sanity check; do not attempt provider-specific normalization in MVP
  if (email.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export function canonicalizePhoneE164(input) {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  if (!s) return null;
  // MVP: accept only pre-normalized E.164 (server re-validates but does not attempt to reformat)
  if (!/^\+[1-9]\d{7,14}$/.test(s)) return null;
  return s;
}

/**
 * Compute server-controlled keyed HMAC for matching.
 * @param {'email'|'phone'} kind
 * @param {string} canonicalValue
 */
export function hmacIdentifier(kind, canonicalValue) {
  if (kind !== 'email' && kind !== 'phone') throw new Error('Invalid kind');
  if (!canonicalValue || typeof canonicalValue !== 'string') throw new Error('canonicalValue required');
  const secret = requireSecret();
  const payload = `${kind}:${canonicalValue}`;
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

