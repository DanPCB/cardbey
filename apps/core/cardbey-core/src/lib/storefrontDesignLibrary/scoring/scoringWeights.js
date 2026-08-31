/**
 * Central versioned scoring weights (provisional — observe during soak).
 * Do not bury weight values inside scorer conditionals.
 */

export const SCORER_VERSION = 1;

/**
 * Dimension weights must sum to 1.0.
 * @type {Readonly<{
 *   businessModelFit: number,
 *   contentCoverage: number,
 *   actionFit: number,
 *   requiredDataReadiness: number,
 *   mediaTrustReadiness: number,
 *   ownerPreference: number,
 * }>}
 */
export const SCORING_WEIGHTS = Object.freeze({
  businessModelFit: 0.3,
  contentCoverage: 0.25,
  actionFit: 0.2,
  requiredDataReadiness: 0.1,
  mediaTrustReadiness: 0.1,
  ownerPreference: 0.05,
});

/** Primary CTA contributes more than secondary within the actionFit dimension. */
export const ACTION_FIT_SPLIT = Object.freeze({
  primary: 0.75,
  secondary: 0.25,
});

/** Max absolute contribution of owner preference to final score (equals weight × 1). */
export const OWNER_PREFERENCE_MAX_BOOST = SCORING_WEIGHTS.ownerPreference;

/**
 * Soft content roles ignored when computing "unsupported" penalties
 * (still may contribute positively when supported).
 */
export const NOISE_CONTENT_ROLES = Object.freeze([
  'navigation',
  'unknown',
  'policy',
  'career',
  'blog',
  'support',
]);

export function assertWeightsSumToOne(weights = SCORING_WEIGHTS) {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > 1e-9) {
    throw new Error(`[designLibrary.scoring] Weights must sum to 1 (got ${sum})`);
  }
  return true;
}

assertWeightsSumToOne();
