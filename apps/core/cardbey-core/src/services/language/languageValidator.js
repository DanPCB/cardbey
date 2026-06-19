/**
 * Language Validator — read-only Vietnamese / i18n quality checks.
 * Phase 1: no source mutation.
 */
import { loadI18nCatalog, listAllKeys, mergeNamespaces } from './languageI18nReader.js';

const VI_CHAR_RE = /[\u00C0-\u1EF9]/;
const BRAND_OR_PRODUCT = new Set([
  'Cardbey',
  'Performer',
  'C-Net',
  'C-Net',
  'POS',
  'API',
  'SSE',
  'QR',
  'TV',
  'AI',
  'MI',
  'Dev',
  'Console',
  'Insights',
  'Suitcase',
  'Template',
  'Manual',
  'OCR',
  'Credits',
  'Tenant',
  'Playlist',
  'Content Studio',
  'Business Builder',
  'Campaign Engine',
  'Smart Displays',
  'Intent Graph',
]);

/**
 * @param {string} text
 * @param {string} [english]
 */
export function isValidVietnamese(text, english = '') {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed) return false;

  if (BRAND_OR_PRODUCT.has(trimmed)) return true;

  const enTrim = String(english ?? '').trim();
  if (enTrim && trimmed === enTrim && !BRAND_OR_PRODUCT.has(trimmed)) {
    return false;
  }

  if (VI_CHAR_RE.test(trimmed)) return true;

  // Short technical tokens (e.g. OK, TV) when English also has no diacritics
  if (trimmed.length <= 12 && /^[A-Za-z0-9\s\-./]+$/.test(trimmed)) {
    if (enTrim && trimmed === enTrim) return false;
    return BRAND_OR_PRODUCT.has(trimmed);
  }

  return false;
}

/**
 * Detect English loanwords inside otherwise Vietnamese copy.
 * @param {string} text
 */
export function hasMixedLanguage(text) {
  if (!text || typeof text !== 'string') return false;
  if (!VI_CHAR_RE.test(text)) return false;

  const englishWords = text.match(/[A-Za-z]{4,}/g);
  if (!englishWords || englishWords.length === 0) return false;

  const nonBrand = englishWords.filter((w) => !BRAND_OR_PRODUCT.has(w));
  if (nonBrand.length >= 1 && englishWords.length >= 2) return true;
  if (nonBrand.length >= 2) return true;

  return false;
}

/**
 * @param {string[]} enKeys
 * @param {string[]} viKeys
 */
export function validateKeyParity(enKeys, viKeys) {
  const enSet = new Set(enKeys);
  const viSet = new Set(viKeys);
  const missingInVi = enKeys.filter((k) => !viSet.has(k));
  const extraInVi = viKeys.filter((k) => !enSet.has(k));

  return {
    pass: missingInVi.length === 0 && extraInVi.length === 0,
    missingInVi,
    extraInVi,
    totalKeys: { en: enKeys.length, vi: viKeys.length },
  };
}

function buildSuggestion(key, viValue, enValue, issue) {
  return {
    key,
    current: viValue,
    english: enValue,
    issue,
    hint: `Review "${key}": vi="${viValue}" (en="${enValue}")`,
  };
}

/**
 * Validate vi leaf strings against en counterparts.
 * @param {{ i18nPath?: string }} [opts]
 */
export async function validateVietnameseStrings(opts = {}) {
  const catalog = loadI18nCatalog(opts);
  const enFlat = mergeNamespaces(catalog, 'en');
  const viFlat = mergeNamespaces(catalog, 'vi');
  /** @type {Array<{ key: string, value: string, english: string, issue: string, suggestion: object }>} */
  const errors = [];

  for (const [key, viValue] of Object.entries(viFlat)) {
    if (typeof viValue !== 'string') continue;
    const enValue = enFlat[key] ?? '';

    if (!isValidVietnamese(viValue, enValue)) {
      errors.push({
        key,
        value: viValue,
        english: enValue,
        issue: 'invalid_vietnamese',
        suggestion: buildSuggestion(key, viValue, enValue, 'invalid_vietnamese'),
      });
      continue;
    }

    if (hasMixedLanguage(viValue)) {
      errors.push({
        key,
        value: viValue,
        english: enValue,
        issue: 'mixed_language',
        suggestion: buildSuggestion(key, viValue, enValue, 'mixed_language'),
      });
    }
  }

  return { pass: errors.length === 0, errors, catalogPath: catalog.i18nPath };
}

/**
 * Full validation report (keys + vi strings).
 * @param {{ i18nPath?: string }} [opts]
 */
export async function runFullValidation(opts = {}) {
  const catalog = loadI18nCatalog(opts);
  const { en, vi } = listAllKeys(catalog);
  const parity = validateKeyParity(en, vi);
  const vietnamese = await validateVietnameseStrings(opts);

  return {
    pass: parity.pass && vietnamese.pass,
    parity,
    vietnamese,
    catalogPath: catalog.i18nPath,
  };
}

export class LanguageValidator {
  isValidVietnamese = isValidVietnamese;
  hasMixedLanguage = hasMixedLanguage;
  validateKeyParity = validateKeyParity;
  validateVietnameseStrings = validateVietnameseStrings;
  runFullValidation = runFullValidation;
}

export default new LanguageValidator();
