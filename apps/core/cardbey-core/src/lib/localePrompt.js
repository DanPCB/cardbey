/**
 * Locale instructions for LLM content generation (store copy, catalog, campaigns).
 * English returns empty string — no extra tokens for default locale.
 */

export const ALLOWED_LOCALES = ['en', 'vi', 'zh', 'ja', 'ko'];

const LOCALE_NAMES = {
  en: 'English',
  vi: 'Vietnamese',
  zh: 'Chinese (Simplified)',
  ja: 'Japanese',
  ko: 'Korean',
};

const VI_DIACRITICS =
  /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

const VI_PHRASE_HINTS = [
  'tao cua hang',
  'cua hang',
  'mo cua hang',
  'trang web',
  'website cua',
  'ho so ca nhan',
  'danh thiep',
  'quang cao',
  'chien dich',
  'khuyen mai',
  'cho toi',
  'cua toi',
];

function primaryLocaleCode(raw) {
  if (raw == null || typeof raw !== 'string') return '';
  const primary = raw.trim().toLowerCase().split(',')[0].trim().split(';')[0].trim();
  return primary.split('-')[0];
}

/**
 * @param {unknown} locale
 * @returns {'en'|'vi'|'zh'|'ja'|'ko'}
 */
export function normalizeLocale(locale) {
  const code = primaryLocaleCode(locale);
  return /** @type {'en'|'vi'|'zh'|'ja'|'ko'} */ (
    ALLOWED_LOCALES.includes(code) ? code : 'en'
  );
}

/**
 * @param {unknown} locale
 * @returns {boolean}
 */
export function isAllowedLocale(locale) {
  const code = primaryLocaleCode(locale);
  return ALLOWED_LOCALES.includes(code);
}

/**
 * @param {string} [locale]
 * @returns {string}
 */
export function localeInstruction(locale = 'en') {
  const normalized = normalizeLocale(locale);
  const lang = LOCALE_NAMES[normalized] ?? 'English';
  if (normalized === 'en') return '';
  return `\nIMPORTANT: Generate ALL content in ${lang}. Product names, descriptions, taglines, and any customer-facing text must be in ${lang}. Do not mix languages. Do not use English unless the store owner's input was in English.`;
}

/**
 * Heuristic locale from free-text user message (intake / guest flows).
 * @param {unknown} text
 * @returns {'en'|'vi'}
 */
export function detectMessageLocale(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return 'en';
  if (VI_DIACRITICS.test(raw)) return 'vi';
  const norm = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (VI_PHRASE_HINTS.some((hint) => norm.includes(hint))) return 'vi';
  return 'en';
}

/**
 * Resolve intake locale: Vietnamese message text wins over explicit header/body locale.
 * @param {unknown} explicit
 * @param {unknown} message
 * @returns {'en'|'vi'|'zh'|'ja'|'ko'}
 */
export function resolveIntakeLocale(explicit, message) {
  if (detectMessageLocale(message) === 'vi') return 'vi';
  return normalizeLocale(explicit);
}
