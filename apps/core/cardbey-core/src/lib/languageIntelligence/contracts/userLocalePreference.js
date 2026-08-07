/**
 * UserLocalePreference — durable preference shape (Phase 1 contract; persistence later).
 */

import { isLanguageCode, normalizeLanguageCode } from './languageCode.js';
import { MEASUREMENT_UNITS, COMMUNICATION_STYLES } from './regionProfile.js';

/**
 * @typedef {Object} UserLocalePreference
 * @property {string} [preferredLanguage]
 * @property {string} [preferredRegion]
 * @property {string} [preferredCurrency]
 * @property {string} [preferredDateFormat]
 * @property {'metric'|'imperial'} [preferredMeasurementUnits]
 * @property {boolean} [manualLanguageSelection]  When true, never override with detection
 * @property {'polite'|'formal'|'friendly'|'direct'|'structured'} [communicationStyleOverride]
 */

/**
 * @param {unknown} value
 * @returns {UserLocalePreference}
 */
export function normalizeUserLocalePreference(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return Object.freeze({});
  }
  const v = /** @type {Record<string, unknown>} */ (value);
  /** @type {UserLocalePreference} */
  const out = {};

  const lang = normalizeLanguageCode(v.preferredLanguage);
  if (lang) out.preferredLanguage = lang;

  if (typeof v.preferredRegion === 'string' && v.preferredRegion.trim()) {
    out.preferredRegion = v.preferredRegion.trim().toUpperCase();
  }
  if (typeof v.preferredCurrency === 'string' && /^[A-Za-z]{3}$/.test(v.preferredCurrency.trim())) {
    out.preferredCurrency = v.preferredCurrency.trim().toUpperCase();
  }
  if (typeof v.preferredDateFormat === 'string' && v.preferredDateFormat.trim()) {
    out.preferredDateFormat = v.preferredDateFormat.trim();
  }
  if (MEASUREMENT_UNITS.includes(/** @type {string} */ (v.preferredMeasurementUnits))) {
    out.preferredMeasurementUnits = /** @type {'metric'|'imperial'} */ (v.preferredMeasurementUnits);
  }
  if (typeof v.manualLanguageSelection === 'boolean') {
    out.manualLanguageSelection = v.manualLanguageSelection;
  } else if (lang && isLanguageCode(lang)) {
    // Explicit preferredLanguage implies manual selection for resolution priority.
    out.manualLanguageSelection = true;
  }
  if (COMMUNICATION_STYLES.includes(/** @type {string} */ (v.communicationStyleOverride))) {
    out.communicationStyleOverride = /** @type {UserLocalePreference['communicationStyleOverride']} */ (
      v.communicationStyleOverride
    );
  }

  return Object.freeze(out);
}
