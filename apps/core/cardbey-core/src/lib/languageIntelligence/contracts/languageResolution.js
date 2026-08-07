/**
 * LanguageResolution — deterministic outcome of preference chain.
 */

import { FALLBACK_LANGUAGE, isLanguageCode, normalizeLanguageCode } from './languageCode.js';

/** Ordered preference sources (highest → lowest). Manual explicit always wins. */
export const PREFERENCE_SOURCES = Object.freeze([
  'explicit',
  'account',
  'browser',
  'device',
  'region_default',
  'fallback',
]);

/**
 * @typedef {Object} LanguageResolutionEvidence
 * @property {string} source   One of PREFERENCE_SOURCES
 * @property {string} [raw]
 * @property {string} [note]
 */

/**
 * @typedef {Object} LanguageResolution
 * @property {string} language
 * @property {string|null} region
 * @property {string} currency
 * @property {string} dateFormat
 * @property {'metric'|'imperial'} measurementUnits
 * @property {string} communicationStyle
 * @property {string} resolvedFrom   Winning PREFERENCE_SOURCES value for language
 * @property {boolean} manualSelectionHonored
 * @property {LanguageResolutionEvidence[]} evidence
 * @property {string} intlLocale
 */

/**
 * @param {unknown} resolution
 * @returns {LanguageResolution}
 */
export function assertLanguageResolution(resolution) {
  if (!resolution || typeof resolution !== 'object' || Array.isArray(resolution)) {
    throw new Error('[languageIntelligence] Invalid LanguageResolution');
  }
  const r = /** @type {Record<string, unknown>} */ (resolution);
  if (!isLanguageCode(r.language)) {
    throw new Error(`[languageIntelligence] LanguageResolution.language invalid: ${String(r.language)}`);
  }
  if (!PREFERENCE_SOURCES.includes(/** @type {string} */ (r.resolvedFrom))) {
    throw new Error(`[languageIntelligence] LanguageResolution.resolvedFrom invalid: ${String(r.resolvedFrom)}`);
  }
  if (!Array.isArray(r.evidence)) {
    throw new Error('[languageIntelligence] LanguageResolution.evidence must be an array');
  }
  return /** @type {LanguageResolution} */ (Object.freeze({ ...r, evidence: Object.freeze([...r.evidence]) }));
}

/**
 * @param {unknown} raw
 * @returns {string|null}
 */
export function coerceLanguageOrNull(raw) {
  return normalizeLanguageCode(raw);
}

/**
 * @returns {string}
 */
export function fallbackLanguage() {
  return FALLBACK_LANGUAGE;
}
