/**
 * Governed service-image resolution pipeline for Performer store generation.
 */

import { buildServiceImageIntent, buildCanonicalServiceKey } from './serviceImageIntentResolver.js';
import {
  scoreServiceImageCandidateMetadata,
  combineServiceImageScores,
  classifyMatchStatus,
  STRONG_MATCH,
  ACCEPTABLE_MATCH,
} from './serviceImageCandidateScorer.js';
import { ServiceImageRegistry, normalizeImageUrlKey } from './serviceImageRegistry.js';
import {
  validateServiceImageVisualRelevance,
  metadataOnlyAcceptThreshold,
} from './serviceImageVisualValidator.js';
import {
  buildServiceImageSearchCacheKey,
  getCachedServiceImageSearch,
  setCachedServiceImageSearch,
} from './serviceImageCache.js';

const CANDIDATES_PER_QUERY = 8;
const MAXIMUM_QUERIES = 4;
const DEBUG = process.env.CARDBEY_DEBUG_IMAGE_QUERY === '1';

/**
 * @param {object} [options]
 */
export function isServiceImageResolverEnabled(options = {}) {
  if (options?.disableServiceImageResolver === true) return false;
  if (process.env.DISABLE_SERVICE_IMAGE_RESOLVER === '1') return false;
  return true;
}

/**
 * @param {object} [options]
 */
export function shouldUseServiceImageResolver(options = {}) {
  if (!isServiceImageResolverEnabled(options)) return false;
  const vertical = String(options?.profile?.verticalGroup ?? options?.verticalGroup ?? '').toLowerCase();
  const slug = String(options?.profile?.verticalSlug ?? options?.verticalSlug ?? '').toLowerCase();
  const businessType = String(options?.businessType ?? '').toLowerCase();
  const serviceLike =
    vertical === 'services' ||
    slug.startsWith('services.') ||
    /\b(handyman|plumb|electric|clean|repair|maintenance|contractor|trades)\b/.test(businessType) ||
    /\b(handyman|handy[\s-]?man)\b/.test(String(options?.storeName ?? '').toLowerCase());
  if (serviceLike) return true;
  if (options?.forceServiceImageResolver === true) return true;
  return false;
}

/**
 * @param {import('../menuVisualAgent/pexelsService.ts').PexelsImageResult} row
 * @param {string} sourceQuery
 * @returns {import('./serviceImageTypes.js').ServiceImageCandidate}
 */
function pexelsToCandidate(row, sourceQuery) {
  return {
    provider: 'pexels',
    providerAssetId: row.id != null ? String(row.id) : undefined,
    imageUrl: row.url,
    thumbnailUrl: row.thumbnailUrl,
    altText: row.alt,
    title: row.alt,
    tags: [],
    sourceQuery,
    license: 'Pexels License',
    attribution: row.photographer
      ? `${row.photographer}${row.photographerUrl ? ` (${row.photographerUrl})` : ''}`
      : undefined,
  };
}

/**
 * @param {object} params
 */
function logResolver(event, payload) {
  if (DEBUG || process.env.SERVICE_IMAGE_RESOLVER_LOG === '1') {
    console.log(`[ServiceImageResolver] ${event}`, payload);
  }
}

/**
 * @param {import('./serviceImageTypes.js').ServiceImageIntent} intent
 * @param {import('./serviceImageTypes.js').ServiceImageCandidate[]} candidates
 * @param {ServiceImageRegistry} registry
 * @param {string} canonicalServiceKey
 * @param {object} opts
 */
async function rankCandidates(intent, candidates, registry, canonicalServiceKey, opts) {
  /** @type {Array<{ candidate: import('./serviceImageTypes.js').ServiceImageCandidate, finalScore: number, metadataScore: number, visualScore?: number, matchedTerms: string[], rejectedConflicts: string[], hardReject: boolean, matchStatus: import('./serviceImageTypes.js').ServiceImageMatchStatus }>} */
  const ranked = [];

  for (const candidate of candidates) {
    const isDuplicate = registry.isDuplicate(canonicalServiceKey, candidate);
    const meta = scoreServiceImageCandidateMetadata(intent, candidate, {
      isDuplicate,
      businessCategory: opts.businessCategory,
    });
    if (meta.hardReject) {
      logResolver('candidate rejected', {
        service: intent.originalTitle,
        canonicalService: intent.canonicalTitle,
        query: candidate.sourceQuery,
        candidateProvider: candidate.provider,
        candidateId: candidate.providerAssetId,
        metadataScore: meta.metadataScore,
        decision: 'rejected',
        reason: meta.rejectedConflicts.join(', ') || 'hard mismatch guard',
      });
      continue;
    }

    const visual = await validateServiceImageVisualRelevance(intent, candidate);
    const visualScore = visual?.containsConflictingSubject ? 0 : visual?.visualScore;
    const finalScore = combineServiceImageScores(
      meta.metadataScore,
      visualScore,
      visual != null,
    );

    ranked.push({
      candidate,
      finalScore,
      metadataScore: meta.metadataScore,
      visualScore,
      matchedTerms: meta.matchedTerms,
      rejectedConflicts: meta.rejectedConflicts,
      hardReject: meta.hardReject,
      matchStatus: classifyMatchStatus(finalScore, meta.hardReject),
    });
  }

  ranked.sort((a, b) => b.finalScore - a.finalScore);
  const eligible = ranked.filter((r) => !r.hardReject && r.finalScore >= ACCEPTABLE_MATCH);
  if (!eligible.length) return null;

  const best = eligible[0];
  const hasStrong = eligible.some((r) => r.finalScore >= STRONG_MATCH);
  if (best.finalScore >= STRONG_MATCH) return best;
  if (best.finalScore >= ACCEPTABLE_MATCH && !hasStrong) return best;
  return null;
}

/**
 * @param {import('./serviceImageTypes.js').ServiceImageIntent} intent
 * @param {object} opts
 */
async function fetchCandidatePool(intent, opts) {
  /** @type {import('./serviceImageTypes.js').ServiceImageCandidate[]} */
  const pool = [];
  const seen = new Set();
  const queries = intent.queries.slice(0, MAXIMUM_QUERIES);
  const orientation = opts.pexelsOrientation ?? 'square';
  const bypassCache = opts.bypassSearchCache === true;

  const { searchPexelsImages, isPexelsAvailable } = await import('../menuVisualAgent/pexelsService.ts');
  if (!isPexelsAvailable()) return pool;

  for (const query of queries) {
    const cacheKey = buildServiceImageSearchCacheKey(
      'pexels',
      intent.canonicalTitle,
      query,
      orientation,
    );
    let rows = bypassCache ? null : getCachedServiceImageSearch(cacheKey);
    if (!rows) {
      rows = await searchPexelsImages(query, CANDIDATES_PER_QUERY, orientation);
      setCachedServiceImageSearch(cacheKey, rows);
    }
    logResolver('candidates fetched', {
      service: intent.originalTitle,
      canonicalService: intent.canonicalTitle,
      query,
      count: rows?.length ?? 0,
    });
    for (const row of rows ?? []) {
      const candidate = pexelsToCandidate(row, query);
      const dedupeKey = candidate.providerAssetId || normalizeImageUrlKey(candidate.imageUrl);
      if (!dedupeKey || seen.has(dedupeKey)) continue;
      if (opts.excludeAssetIds?.has?.(candidate.providerAssetId)) continue;
      if (opts.excludeUrls?.has?.(normalizeImageUrlKey(candidate.imageUrl))) continue;
      seen.add(dedupeKey);
      pool.push(candidate);
    }
  }
  return pool;
}

/**
 * @param {object} params
 * @returns {Promise<import('../menuVisualAgent/menuVisualAgent.ts').GenerateImageForDraftItemResult | null>}
 */
export async function resolveServiceImageForItem(params = {}) {
  const {
    serviceName,
    description,
    businessCategory,
    businessSubcategory,
    location,
    imageQueryHint,
    categoryName,
    storeName,
    registry: externalRegistry,
    usedUrls,
    excludeAssetIds,
    excludeUrls,
    bypassSearchCache,
    pexelsOrientation,
    forceRetry = false,
  } = params;

  const intent = buildServiceImageIntent({
    serviceName,
    description,
    businessCategory: businessCategory ?? categoryName,
    businessSubcategory,
    location,
    imageQueryHint,
  });

  logResolver('intent built', {
    service: intent.originalTitle,
    canonicalService: intent.canonicalTitle,
    queries: intent.queries,
  });

  const registry = externalRegistry instanceof ServiceImageRegistry ? externalRegistry : new ServiceImageRegistry();
  const canonicalServiceKey = buildCanonicalServiceKey(intent.canonicalTitle, categoryName ?? intent.canonicalCategory);

  const excludeUrlSet = new Set([
    ...(Array.isArray(usedUrls) ? usedUrls : []),
    ...(usedUrls instanceof Set ? [...usedUrls] : []),
  ].map(normalizeImageUrlKey));

  const pool = typeof params.candidateFetcher === 'function'
    ? await params.candidateFetcher(intent, {
        pexelsOrientation,
        bypassSearchCache: bypassSearchCache || forceRetry,
        excludeAssetIds,
        excludeUrls: excludeUrlSet,
      })
    : await fetchCandidatePool(intent, {
        pexelsOrientation,
        bypassSearchCache: bypassSearchCache || forceRetry,
        excludeAssetIds,
        excludeUrls: excludeUrlSet,
      });

  const winner = await rankCandidates(intent, pool, registry, canonicalServiceKey, {
    businessCategory: businessCategory ?? categoryName,
  });

  if (!winner) {
    logResolver('fallback used', {
      service: intent.originalTitle,
      canonicalService: intent.canonicalTitle,
      decision: 'missing',
      reason: 'no candidate met relevance threshold',
    });
    return null;
  }

  registry.register(canonicalServiceKey, winner.candidate);
  if (winner.candidate.imageUrl) excludeUrlSet.add(normalizeImageUrlKey(winner.candidate.imageUrl));

  const matchStatus =
    winner.finalScore >= STRONG_MATCH ? 'strong' : winner.finalScore >= ACCEPTABLE_MATCH ? 'acceptable' : 'missing';

  logResolver('candidate accepted', {
    service: intent.originalTitle,
    canonicalService: intent.canonicalTitle,
    query: winner.candidate.sourceQuery,
    candidateProvider: winner.candidate.provider,
    candidateId: winner.candidate.providerAssetId,
    metadataScore: winner.metadataScore,
    visualScore: winner.visualScore,
    finalScore: winner.finalScore,
    decision: 'accepted',
    matchStatus,
  });

  /** @type {import('./serviceImageTypes.js').ServiceImageSelection} */
  const imageSelection = {
    provider: winner.candidate.provider,
    providerAssetId: winner.candidate.providerAssetId,
    sourceQuery: winner.candidate.sourceQuery,
    canonicalService: intent.canonicalTitle,
    metadataScore: winner.metadataScore,
    visualScore: winner.visualScore,
    finalScore: winner.finalScore,
    matchStatus,
    matchedTerms: winner.matchedTerms,
    rejectedConflicts: winner.rejectedConflicts,
    selectedAt: new Date().toISOString(),
  };

  return {
    url: winner.candidate.imageUrl,
    source: 'pexels',
    query: winner.candidate.sourceQuery,
    confidence: winner.finalScore,
    providerId: winner.candidate.providerAssetId,
    meta: {
      alt: winner.candidate.altText,
      attribution: winner.candidate.attribution,
    },
    imageSelection,
    imageMatchStatus: matchStatus,
    canonicalServiceTitle: intent.canonicalTitle,
  };
}

export { ServiceImageRegistry } from './serviceImageRegistry.js';
export { dedupeServiceCatalogItems } from './serviceCatalogDedupe.js';
export {
  buildServiceImageIntent,
  canonicalizeServiceTitle,
  normalizeServiceKey,
} from './serviceImageIntentResolver.js';
