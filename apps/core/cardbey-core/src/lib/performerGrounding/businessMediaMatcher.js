/**
 * Closest-content media matching for catalog items.
 */

import { PROVENANCE_SOURCE } from './performerGroundingTypes.js';

const CATEGORY_FALLBACK_THRESHOLD = 0.42;
const EXACT_MATCH_THRESHOLD = 0.78;

function tokenize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function jaccard(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  if (!setA.size || !setB.size) return 0;
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter += 1;
  return inter / (setA.size + setB.size - inter);
}

/**
 * @typedef {Object} MediaMatchResult
 * @property {string} [mediaUrl]
 * @property {number} score
 * @property {string[]} reasons
 * @property {import('./performerGroundingTypes.js').ContentProvenance} provenance
 * @property {boolean} fallbackUsed
 */

/**
 * @param {object} params
 * @param {{ name: string; description?: string; category?: string; itemType?: string }} params.item
 * @param {import('./performerGroundingTypes.js').MediaEvidence[]} params.availableMedia
 * @param {import('./performerGroundingTypes.js').FallbackPolicy} [params.fallbackPolicy]
 */
export function matchMediaToItem(params) {
  const item = params.item ?? {};
  const media = Array.isArray(params.availableMedia) ? params.availableMedia : [];
  const policy = params.fallbackPolicy ?? { allowCategoryImages: true };
  const itemTokens = [...tokenize(item.name), ...tokenize(item.description), ...tokenize(item.category)];

  let best = null;
  for (const asset of media) {
    const assetTokens = [
      ...tokenize(asset.url),
      ...(Array.isArray(asset.tags) ? asset.tags.flatMap(tokenize) : []),
    ];
    const score = jaccard(itemTokens, assetTokens);
    if (!best || score > best.score) {
      best = { asset, score, reasons: score > 0 ? ['token_overlap'] : ['weak_overlap'] };
    }
  }

  if (best && best.score >= EXACT_MATCH_THRESHOLD) {
    const trust = best.asset.trustLevel;
    const source =
      trust === 'OWNER_VERIFIED'
        ? PROVENANCE_SOURCE.OWNER_PROVIDED
        : trust === 'OFFICIAL'
          ? PROVENANCE_SOURCE.OFFICIAL_SOURCE
          : PROVENANCE_SOURCE.VERIFIED_EXTERNAL;
    return {
      mediaUrl: best.asset.url,
      score: best.score,
      reasons: [...best.reasons, 'high_confidence_match'],
      provenance: {
        source,
        sourceRefs: [best.asset.sourceId ?? best.asset.url].filter(Boolean),
        confidence: best.score,
        requiresOwnerReview: false,
      },
      fallbackUsed: false,
    };
  }

  if (best && best.score >= CATEGORY_FALLBACK_THRESHOLD && policy.allowCategoryImages) {
    return {
      mediaUrl: best.asset.url,
      score: best.score,
      reasons: [...(best?.reasons ?? []), 'category_fallback'],
      provenance: {
        source: PROVENANCE_SOURCE.CATEGORY_FALLBACK,
        sourceRefs: [best.asset.sourceId ?? best.asset.url].filter(Boolean),
        confidence: best.score,
        requiresOwnerReview: true,
      },
      fallbackUsed: true,
    };
  }

  return {
    mediaUrl: undefined,
    score: best?.score ?? 0,
    reasons: ['no_confident_match'],
    provenance: {
      source: PROVENANCE_SOURCE.CATEGORY_FALLBACK,
      sourceRefs: [],
      confidence: 0,
      requiresOwnerReview: true,
    },
    fallbackUsed: false,
  };
}

export const BusinessMediaMatcher = { matchMediaToItem };
export default BusinessMediaMatcher;
