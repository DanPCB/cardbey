/**
 * Social profile link keys and validation (Business + User).
 */

export const SOCIAL_LINK_KEYS = [
  'instagram',
  'facebook',
  'tiktok',
  'x',
  'youtube',
  'linkedin',
  'whatsapp',
];

/** Frontscreen card display priority (max 4 shown). */
export const FRONTSCREEN_SOCIAL_PRIORITY = ['instagram', 'facebook', 'tiktok', 'whatsapp'];

export function isValidHttpUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const u = new URL(value.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Normalize socialLinks input: trim URLs, drop empty keys, reject invalid URLs.
 * @param {unknown} input
 * @returns {{ ok: true, value: object|null } | { ok: false, message: string }}
 */
export function normalizeSocialLinks(input) {
  if (input === null || input === undefined) {
    return { ok: true, value: null };
  }
  if (typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, message: 'socialLinks must be an object or null' };
  }

  const result = {};
  for (const key of SOCIAL_LINK_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
    const raw = input[key];
    if (raw === null || raw === undefined) continue;
    if (typeof raw !== 'string') {
      return { ok: false, message: `${key} must be a URL string` };
    }
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (!isValidHttpUrl(trimmed)) {
      return { ok: false, message: `${key} must be a valid http(s) URL` };
    }
    result[key] = trimmed;
  }

  return { ok: true, value: Object.keys(result).length ? result : null };
}

/**
 * @param {unknown} raw - DB Json field or parsed object
 * @returns {Record<string, string>|null}
 */
export function parseSocialLinks(raw) {
  if (raw == null) return null;
  let obj = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof obj !== 'object' || Array.isArray(obj)) return null;
  const normalized = normalizeSocialLinks(obj);
  return normalized.ok ? normalized.value : null;
}

/**
 * Validate per-network URLs for Performer partial updates. Skips invalid entries instead of failing the batch.
 * @param {unknown} input
 * @returns {{ written: Record<string, string>, skipped: Array<{ key: string, reason: string }>, keysWritten: string[] }}
 */
export function collectValidSocialLinksPartial(input) {
  /** @type {Record<string, string>} */
  const written = {};
  /** @type {Array<{ key: string, reason: string }>} */
  const skipped = [];

  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    return { written, skipped, keysWritten: [] };
  }

  for (const key of SOCIAL_LINK_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
    const raw = input[key];
    if (raw === null || raw === undefined) continue;
    if (typeof raw !== 'string') {
      skipped.push({ key, reason: 'not_a_string' });
      console.warn('[PERFORMER_SOCIAL_LINK_SKIPPED]', { key, reason: 'not_a_string' });
      continue;
    }
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (!isValidHttpUrl(trimmed)) {
      skipped.push({ key, reason: 'invalid_url' });
      console.warn('[PERFORMER_SOCIAL_LINK_SKIPPED]', { key, reason: 'invalid_url', value: trimmed.slice(0, 120) });
      continue;
    }
    written[key] = trimmed;
  }

  return { written, skipped, keysWritten: Object.keys(written) };
}

/**
 * Merge partial social link updates onto existing store links (unmentioned keys preserved).
 * @param {unknown} existing
 * @param {Record<string, string>} partial
 * @returns {Record<string, string>|null}
 */
export function mergeSocialLinksRecords(existing, partial) {
  if (!partial || !Object.keys(partial).length) {
    return parseSocialLinks(existing);
  }
  const base = parseSocialLinks(existing) ?? {};
  const merged = { ...base, ...partial };
  return Object.keys(merged).length ? merged : null;
}
