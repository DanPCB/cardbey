/**
 * TranslationRecord — view-layer artifact for one language × revision.
 * Never replaces CanonicalContentRef source fields.
 */

import { isLanguageCode } from './languageCode.js';

export const TRANSLATION_CONFIDENCE = Object.freeze(['high', 'medium', 'low']);
export const TRANSLATION_STATUS = Object.freeze([
  'draft',
  'cached',
  'pending_review',
  'approved',
  'published',
  'rejected',
]);

/**
 * @typedef {Object} TranslationRecord
 * @property {string} id
 * @property {string} targetLanguage
 * @property {string} text
 * @property {'high'|'medium'|'low'} confidence
 * @property {string|number} sourceRevision
 * @property {string} [provider]
 * @property {'draft'|'cached'|'pending_review'|'approved'|'published'|'rejected'} status
 * @property {string} [createdAt]
 * @property {string} [reviewedAt]
 * @property {string} [reviewedBy]
 * @property {Record<string, unknown>} [metadata]
 */

/**
 * @param {unknown} value
 * @returns {TranslationRecord}
 */
export function assertTranslationRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('[languageIntelligence] Invalid TranslationRecord');
  }
  const v = /** @type {Record<string, unknown>} */ (value);
  if (typeof v.id !== 'string' || !v.id.trim()) {
    throw new Error('[languageIntelligence] TranslationRecord.id required');
  }
  if (!isLanguageCode(v.targetLanguage)) {
    throw new Error(
      `[languageIntelligence] TranslationRecord.targetLanguage invalid: ${String(v.targetLanguage)}`,
    );
  }
  if (typeof v.text !== 'string') {
    throw new Error('[languageIntelligence] TranslationRecord.text must be a string');
  }
  if (!TRANSLATION_CONFIDENCE.includes(/** @type {string} */ (v.confidence))) {
    throw new Error(
      `[languageIntelligence] TranslationRecord.confidence invalid: ${String(v.confidence)}`,
    );
  }
  if (v.sourceRevision == null || (typeof v.sourceRevision !== 'string' && typeof v.sourceRevision !== 'number')) {
    throw new Error('[languageIntelligence] TranslationRecord.sourceRevision required');
  }
  if (!TRANSLATION_STATUS.includes(/** @type {string} */ (v.status))) {
    throw new Error(`[languageIntelligence] TranslationRecord.status invalid: ${String(v.status)}`);
  }
  return /** @type {TranslationRecord} */ (Object.freeze({ ...v }));
}

/**
 * Low confidence → owner review before publish (policy helper).
 * @param {'high'|'medium'|'low'} confidence
 * @returns {boolean}
 */
export function requiresOwnerReviewForConfidence(confidence) {
  return confidence === 'low';
}
