/**
 * Translation quality / approval statuses for Stage 5A durable metadata.
 */

export const TRANSLATION_QUALITY_STATUSES = Object.freeze([
  'generated',
  'needs_review',
  'approved',
  'rejected',
  'stale',
  'invalid',
  'suppressed',
]);

export const PUBLIC_TRANSLATION_CONSUMPTION_POLICIES = Object.freeze([
  'canonical_only',
  'existing_valid_translations',
  'approved_translations_only',
]);

/**
 * @param {unknown} status
 * @returns {boolean}
 */
export function isTranslationQualityStatus(status) {
  return TRANSLATION_QUALITY_STATUSES.includes(/** @type {string} */ (status));
}

/**
 * Whether a quality status may be rendered under approved_translations_only.
 * @param {string|null|undefined} status
 */
export function isPubliclyConsumableQualityStatus(status) {
  return status === 'approved';
}
