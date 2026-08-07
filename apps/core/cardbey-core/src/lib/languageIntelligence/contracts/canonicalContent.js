/**
 * CanonicalContentRef — points at authoritative source fields.
 * Translation never becomes the source of truth.
 */

import { isLanguageCode } from './languageCode.js';

/**
 * @typedef {Object} CanonicalContentRef
 * @property {string} entityType          e.g. product, category, message, policy
 * @property {string} entityId
 * @property {string} field               e.g. name, description, body
 * @property {string} sourceLanguage
 * @property {string|number} revision     Content revision / updatedAt stamp for cache keys
 * @property {string} [sourceTextPreview] Optional short preview for diagnostics (not storage)
 */

/**
 * @param {unknown} value
 * @returns {CanonicalContentRef}
 */
export function assertCanonicalContentRef(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('[languageIntelligence] Invalid CanonicalContentRef');
  }
  const v = /** @type {Record<string, unknown>} */ (value);
  if (typeof v.entityType !== 'string' || !v.entityType.trim()) {
    throw new Error('[languageIntelligence] CanonicalContentRef.entityType required');
  }
  if (typeof v.entityId !== 'string' || !v.entityId.trim()) {
    throw new Error('[languageIntelligence] CanonicalContentRef.entityId required');
  }
  if (typeof v.field !== 'string' || !v.field.trim()) {
    throw new Error('[languageIntelligence] CanonicalContentRef.field required');
  }
  if (!isLanguageCode(v.sourceLanguage)) {
    throw new Error(
      `[languageIntelligence] CanonicalContentRef.sourceLanguage invalid: ${String(v.sourceLanguage)}`,
    );
  }
  if (v.revision == null || (typeof v.revision !== 'string' && typeof v.revision !== 'number')) {
    throw new Error('[languageIntelligence] CanonicalContentRef.revision required');
  }
  return /** @type {CanonicalContentRef} */ (Object.freeze({ ...v }));
}
