/**
 * RegionProfile — regional defaults for language, currency, date, units, communication style.
 */

import { isLanguageCode } from './languageCode.js';

export const MEASUREMENT_UNITS = Object.freeze(['metric', 'imperial']);
export const COMMUNICATION_STYLES = Object.freeze([
  'polite',
  'formal',
  'friendly',
  'direct',
  'structured',
]);

/**
 * @typedef {Object} RegionProfile
 * @property {string} id                  Region code (e.g. VN, AU, US)
 * @property {number} version
 * @property {string} name
 * @property {string} defaultLanguage
 * @property {string} currency
 * @property {string} dateFormat
 * @property {'metric'|'imperial'} measurementUnits
 * @property {'polite'|'formal'|'friendly'|'direct'|'structured'} communicationStyle
 * @property {string} [intlLocale]        BCP-47 locale for Intl APIs
 * @property {Record<string, unknown>} [metadata]
 */

/**
 * @param {unknown} profile
 * @returns {RegionProfile}
 */
export function assertRegionProfile(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new Error('[languageIntelligence] Invalid RegionProfile');
  }
  const p = /** @type {Record<string, unknown>} */ (profile);
  if (typeof p.id !== 'string' || !p.id.trim()) {
    throw new Error('[languageIntelligence] RegionProfile.id required');
  }
  if (typeof p.version !== 'number' || !Number.isFinite(p.version)) {
    throw new Error(`[languageIntelligence] RegionProfile.version invalid for "${p.id}"`);
  }
  if (typeof p.name !== 'string' || !p.name.trim()) {
    throw new Error(`[languageIntelligence] RegionProfile.name required for "${p.id}"`);
  }
  if (!isLanguageCode(p.defaultLanguage)) {
    throw new Error(
      `[languageIntelligence] RegionProfile.defaultLanguage invalid for "${p.id}": ${String(p.defaultLanguage)}`,
    );
  }
  if (typeof p.currency !== 'string' || !/^[A-Z]{3}$/.test(p.currency)) {
    throw new Error(`[languageIntelligence] RegionProfile.currency must be ISO 4217 for "${p.id}"`);
  }
  if (typeof p.dateFormat !== 'string' || !p.dateFormat.trim()) {
    throw new Error(`[languageIntelligence] RegionProfile.dateFormat required for "${p.id}"`);
  }
  if (!MEASUREMENT_UNITS.includes(/** @type {string} */ (p.measurementUnits))) {
    throw new Error(`[languageIntelligence] RegionProfile.measurementUnits invalid for "${p.id}"`);
  }
  if (!COMMUNICATION_STYLES.includes(/** @type {string} */ (p.communicationStyle))) {
    throw new Error(`[languageIntelligence] RegionProfile.communicationStyle invalid for "${p.id}"`);
  }
  return /** @type {RegionProfile} */ (Object.freeze({ ...p }));
}
