/** Canonical store review enums, source types, and display-policy thresholds. */

export const VERIFICATION_STATUS = Object.freeze({
  VERIFIED: 'VERIFIED',
  UNVERIFIED: 'UNVERIFIED',
  PENDING: 'PENDING',
  REJECTED: 'REJECTED',
});

export const PUBLICATION_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  PUBLISHED: 'PUBLISHED',
  HIDDEN: 'HIDDEN',
  REMOVED: 'REMOVED',
});

export const MODERATION_STATUS = Object.freeze({
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  FLAGGED: 'FLAGGED',
  REJECTED: 'REJECTED',
});

export const SOURCE_TYPE = Object.freeze({
  STORE_VISIT: 'STORE_VISIT',
  MANUAL_UNVERIFIED: 'MANUAL_UNVERIFIED',
  BOOKING: 'BOOKING',
  ORDER: 'ORDER',
  LEGACY_TESTIMONIAL: 'LEGACY_TESTIMONIAL',
});

export const MODERATION_ACTION = Object.freeze({
  APPROVE: 'approve',
  REJECT: 'reject',
  HIDE: 'hide',
  RESTORE: 'restore',
  REMOVE: 'remove',
  FLAG: 'flag',
  REPORT: 'report',
});

export const SORT_OPTIONS = Object.freeze({
  NEWEST: 'newest',
  HIGHEST: 'highest',
  LOWEST: 'lowest',
  RELEVANT: 'relevant',
});

/** Default display / ranking policy thresholds (overridable via storeReviewPolicy). */
export const DISPLAY_POLICY_DEFAULTS = Object.freeze({
  MIN_REVIEWS_FOR_DISPLAY: 1,
  MIN_REVIEWS_FOR_RANKING: 3,
  MIN_REVIEWS_FOR_BADGE: 5,
});

export const RATING_MIN = 1;
export const RATING_MAX = 5;

/** Light optional blocklist — empty-safe; extend via env STORE_REVIEW_PROFANITY_BLOCKLIST. */
export const DEFAULT_PROFANITY_BLOCKLIST = Object.freeze([
  'fuck',
  'shit',
  'asshole',
  'cunt',
  'nigger',
  'faggot',
]);

/**
 * @param {unknown} rating
 * @returns {boolean}
 */
export function isValidRating(rating) {
  const n = Number(rating);
  return Number.isInteger(n) && n >= RATING_MIN && n <= RATING_MAX;
}

/**
 * @param {unknown} sourceType
 * @returns {boolean}
 */
export function isKnownSourceType(sourceType) {
  return Object.values(SOURCE_TYPE).includes(String(sourceType ?? ''));
}

/**
 * Round display average to 1 decimal place.
 * @param {number} value
 */
export function roundDisplayRating(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10) / 10;
}
