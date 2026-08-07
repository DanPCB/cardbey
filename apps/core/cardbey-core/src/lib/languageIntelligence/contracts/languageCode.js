/**
 * LanguageCode — BCP-47 primary tags supported by Language Intelligence.
 * Extensible via registry definitions; this set is the Phase 1 seed vocabulary.
 */

export const LANGUAGE_CODES = Object.freeze([
  'vi',
  'en',
  'zh',
  'ja',
  'ko',
  'th',
  'fr',
  'de',
  'es',
  'pt',
  'ar',
  'ru',
]);

export const LANGUAGE_CODE_SET = new Set(LANGUAGE_CODES);

export const FALLBACK_LANGUAGE = 'en';

/**
 * @param {unknown} code
 * @returns {boolean}
 */
export function isLanguageCode(code) {
  return LANGUAGE_CODE_SET.has(String(code ?? '').trim().toLowerCase());
}

/**
 * Extract primary language subtag (e.g. "en-AU" → "en").
 * @param {unknown} raw
 * @returns {string}
 */
export function primaryLanguageTag(raw) {
  if (raw == null || typeof raw !== 'string') return '';
  const primary = raw.trim().toLowerCase().split(',')[0].trim().split(';')[0].trim();
  return primary.split('-')[0] || '';
}

/**
 * @param {unknown} raw
 * @returns {string|null} Normalized supported code or null
 */
export function normalizeLanguageCode(raw) {
  const code = primaryLanguageTag(raw);
  return isLanguageCode(code) ? code : null;
}
