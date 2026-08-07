/**
 * Backward-compatible AccountProfile.languages reader/writer.
 * Legacy: string[]
 * Phase 4: { v: 1, spoken: string[], preference: UserLocalePreference }
 */

import { normalizeUserLocalePreference } from '../contracts/userLocalePreference.js';
import { normalizeLanguageCode } from '../contracts/languageCode.js';

/**
 * @param {unknown} raw
 * @returns {{ spoken: string[], preference: import('../contracts/userLocalePreference.js').UserLocalePreference, version: number }}
 */
export function readLanguagesField(raw) {
  if (Array.isArray(raw)) {
    const spoken = raw
      .map((x) => normalizeLanguageCode(x) || (typeof x === 'string' ? x.trim().toLowerCase() : ''))
      .filter(Boolean);
    return { spoken, preference: Object.freeze({}), version: 0 };
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const obj = /** @type {Record<string, unknown>} */ (raw);
    const spokenRaw = Array.isArray(obj.spoken)
      ? obj.spoken
      : Array.isArray(obj.codes)
        ? obj.codes
        : [];
    const spoken = spokenRaw
      .map((x) => normalizeLanguageCode(x) || (typeof x === 'string' ? x.trim().toLowerCase() : ''))
      .filter(Boolean);
    const preference = normalizeUserLocalePreference(obj.preference ?? obj.localePreference ?? {});
    return {
      spoken,
      preference,
      version: typeof obj.v === 'number' ? obj.v : 1,
    };
  }
  return { spoken: [], preference: Object.freeze({}), version: 0 };
}

/**
 * @param {unknown} existing
 * @param {{ spoken?: string[], preference?: object }} patch
 */
export function mergeLanguagesField(existing, patch = {}) {
  const current = readLanguagesField(existing);
  const spoken = Array.isArray(patch.spoken)
    ? patch.spoken
        .map((x) => normalizeLanguageCode(x) || String(x).trim().toLowerCase())
        .filter(Boolean)
    : current.spoken;
  const preference = normalizeUserLocalePreference({
    ...current.preference,
    ...(patch.preference && typeof patch.preference === 'object' ? patch.preference : {}),
  });
  return Object.freeze({
    v: 1,
    spoken: Object.freeze([...spoken]),
    preference,
  });
}

/**
 * Spoken language list for identity/public profile (never exposes preference object as array).
 * @param {unknown} raw
 * @returns {string[]}
 */
export function spokenLanguagesFromField(raw) {
  return readLanguagesField(raw).spoken;
}
