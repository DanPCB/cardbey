/**
 * Store reputation score stub — do NOT wire into production discovery ranking.
 *
 * Future: blend rating aggregate + engagement + trust signals into a single score.
 */

/**
 * @typedef {object} StoreReputationScore
 * @property {string} storeId
 * @property {number} score
 * @property {number} confidence
 * @property {'stub'|'v1'} version
 * @property {{ averageRating?: number, publishedReviewCount?: number }} signals
 */

/**
 * Stub reputation score from rating aggregate only. Not used for feed ranking.
 *
 * @param {string} storeId
 * @param {{ averageRating?: number, publishedReviewCount?: number } | null} aggregate
 * @returns {StoreReputationScore}
 */
export function computeStoreReputationStub(storeId, aggregate) {
  const count = Number(aggregate?.publishedReviewCount ?? 0);
  const avg = Number(aggregate?.averageRating ?? 0);
  const score = count > 0 ? avg : 0;
  const confidence = Math.min(1, count / 10);

  return {
    storeId: String(storeId ?? ''),
    score,
    confidence,
    version: 'stub',
    signals: {
      averageRating: avg,
      publishedReviewCount: count,
    },
  };
}
