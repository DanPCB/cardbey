/**
 * Read-only bridge to legacy localePrompt.js (LLM generation locales).
 * Does not expand or mutate ALLOWED_LOCALES — Language Intelligence registry is wider.
 */

import {
  ALLOWED_LOCALES,
  normalizeLocale,
  detectMessageLocale,
  resolveIntakeLocale,
  isAllowedLocale,
} from '../../localePrompt.js';
import { normalizeLanguageCode } from '../contracts/languageCode.js';

/**
 * @returns {readonly string[]}
 */
export function listLegacyLlmLocales() {
  return Object.freeze([...ALLOWED_LOCALES]);
}

/**
 * Map Language Intelligence language → legacy LLM locale (fallback en if unsupported by LLM).
 * @param {unknown} language
 * @returns {'en'|'vi'|'zh'|'ja'|'ko'}
 */
export function toLegacyLlmLocale(language) {
  const code = normalizeLanguageCode(language) || 'en';
  if (isAllowedLocale(code)) return normalizeLocale(code);
  return 'en';
}

/**
 * @param {unknown} text
 * @returns {'en'|'vi'}
 */
export function detectLegacyMessageLocale(text) {
  return detectMessageLocale(text);
}

/**
 * @param {unknown} explicit
 * @param {unknown} message
 */
export function resolveLegacyIntakeLocale(explicit, message) {
  return resolveIntakeLocale(explicit, message);
}

/**
 * Whether a Language Intelligence language is also accepted by localePrompt today.
 * @param {unknown} language
 * @returns {boolean}
 */
export function isLegacyLlmLocale(language) {
  return isAllowedLocale(language);
}
