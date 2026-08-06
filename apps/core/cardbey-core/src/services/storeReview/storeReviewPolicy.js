/**
 * Configurable store-review policy (env-backed).
 */

import {
  DISPLAY_POLICY_DEFAULTS,
  DEFAULT_PROFANITY_BLOCKLIST,
} from './storeReviewTypes.js';
import { Features } from '../../config/features.js';

function parseIntEnv(raw, fallback) {
  const n = parseInt(String(raw ?? ''), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function parseBoolEnv(raw, defaultValue) {
  const normalized = String(raw ?? '').trim().toLowerCase();
  if (normalized === 'false' || normalized === '0' || normalized === 'off' || normalized === 'no') {
    return false;
  }
  if (normalized === 'true' || normalized === '1' || normalized === 'on' || normalized === 'yes') {
    return true;
  }
  return defaultValue;
}

/**
 * @returns {{
 *   minReviewsForDisplay: number,
 *   minReviewsForRanking: number,
 *   minReviewsForBadge: number,
 *   includeLegacyInRating: boolean,
 *   autoPublish: boolean,
 *   allowPendingInAggregate: boolean,
 *   rateLimitPerHour: number,
 *   profanityBlocklist: string[],
 * }}
 */
export function getStoreReviewPolicy() {
  const moderationOn = Boolean(Features.storeReviews?.moderationV1);
  return {
    minReviewsForDisplay: parseIntEnv(
      process.env.STORE_REVIEW_MIN_FOR_DISPLAY,
      DISPLAY_POLICY_DEFAULTS.MIN_REVIEWS_FOR_DISPLAY,
    ),
    minReviewsForRanking: parseIntEnv(
      process.env.STORE_REVIEW_MIN_FOR_RANKING,
      DISPLAY_POLICY_DEFAULTS.MIN_REVIEWS_FOR_RANKING,
    ),
    minReviewsForBadge: parseIntEnv(
      process.env.STORE_REVIEW_MIN_FOR_BADGE,
      DISPLAY_POLICY_DEFAULTS.MIN_REVIEWS_FOR_BADGE,
    ),
    /** Default false: LEGACY_TESTIMONIAL excluded from rating unless explicitly allowed. */
    includeLegacyInRating: parseBoolEnv(process.env.STORE_REVIEW_INCLUDE_LEGACY_IN_RATING, false),
    /** Auto-publish when moderation feature is off. */
    autoPublish: !moderationOn || parseBoolEnv(process.env.STORE_REVIEW_AUTO_PUBLISH, false),
    /** When true, PUBLISHED+PENDING counts toward aggregate (pilot). Default false. */
    allowPendingInAggregate: parseBoolEnv(process.env.STORE_REVIEW_ALLOW_PENDING_IN_AGGREGATE, false),
    rateLimitPerHour: parseIntEnv(process.env.STORE_REVIEW_RATE_LIMIT_PER_HOUR, 5),
    profanityBlocklist: readProfanityBlocklist(),
  };
}

function readProfanityBlocklist() {
  const raw = String(process.env.STORE_REVIEW_PROFANITY_BLOCKLIST ?? '').trim();
  if (!raw) return [...DEFAULT_PROFANITY_BLOCKLIST];
  if (raw === 'off' || raw === 'none') return [];
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Display policy snapshot for API summary responses.
 * @param {{ publishedReviewCount?: number, averageRating?: number }} aggregate
 */
export function buildDisplayPolicy(aggregate = {}) {
  const policy = getStoreReviewPolicy();
  const count = Number(aggregate.publishedReviewCount ?? 0);
  return {
    minReviewsForDisplay: policy.minReviewsForDisplay,
    minReviewsForRanking: policy.minReviewsForRanking,
    minReviewsForBadge: policy.minReviewsForBadge,
    showRating: count >= policy.minReviewsForDisplay,
    eligibleForRanking: count >= policy.minReviewsForRanking,
    showBadge: count >= policy.minReviewsForBadge,
    publishedReviewCount: count,
    averageRating: aggregate.averageRating ?? 0,
  };
}
