/**
 * Single authoritative catalogue decision + structured trace for create-store.
 */

import {
  isResearchCatalogPendingOwnerReview,
  isStageSourcedCatalogPendingReviewEnabled,
  researchHasCatalogItems,
  shouldApplyResearchCatalogToDraft,
} from '../../services/draftStore/researchCatalogDraft.js';
import { isStoreResearchPipelineEnabled } from '../storeResearch/runStoreResearchPipeline.js';
import { resolveStoreResearchInputFields } from './researchInputFields.js';

export const CATALOG_FALLBACK_REASONS = Object.freeze({
  RESEARCH_PIPELINE_DISABLED: 'RESEARCH_PIPELINE_DISABLED',
  PLACES_NOT_CONFIGURED: 'PLACES_NOT_CONFIGURED',
  IDENTITY_NOT_RESOLVED: 'IDENTITY_NOT_RESOLVED',
  WEBSITE_NOT_FOUND: 'WEBSITE_NOT_FOUND',
  WEBSITE_FETCH_FAILED: 'WEBSITE_FETCH_FAILED',
  WEBSITE_UNSUPPORTED: 'WEBSITE_UNSUPPORTED',
  NO_CATALOG_CONTENT_FOUND: 'NO_CATALOG_CONTENT_FOUND',
  RESEARCH_RESULT_EMPTY: 'RESEARCH_RESULT_EMPTY',
  RESEARCH_CONFIDENCE_TOO_LOW: 'RESEARCH_CONFIDENCE_TOO_LOW',
  OWNER_REVIEW_STAGING_DISABLED: 'OWNER_REVIEW_STAGING_DISABLED',
  RESEARCH_EXCEPTION: 'RESEARCH_EXCEPTION',
  RESEARCH_NOT_ATTEMPTED: 'RESEARCH_NOT_ATTEMPTED',
  PRELOADED_CATALOG: 'PRELOADED_CATALOG',
  SEMANTIC_WEBSITE_OFFERINGS: 'SEMANTIC_WEBSITE_OFFERINGS',
  STRUCTURED_CATALOG: 'STRUCTURED_CATALOG',
  CORROBORATED_OFFERINGS: 'CORROBORATED_OFFERINGS',
  SPARSE_NO_EVIDENCE: 'SPARSE_NO_EVIDENCE',
});

export const CATALOG_AUTHORITY_SOURCES = Object.freeze({
  STRUCTURED_CATALOG: 'STRUCTURED_CATALOG',
  SEMANTIC_WEBSITE_OFFERINGS: 'SEMANTIC_WEBSITE_OFFERINGS',
  CORROBORATED_OFFERINGS: 'CORROBORATED_OFFERINGS',
  SPARSE_NO_EVIDENCE: 'SPARSE_NO_EVIDENCE',
});

const MAPS_URL_RE = /google\.(com|com\.[a-z]+|co\.[a-z]+)\/maps|maps\.google/i;

function sourceTypeOf(source) {
  return String(source?.sourceType ?? source?.source?.sourceType ?? '').toLowerCase();
}

function sourceUrlOf(source) {
  return (
    source?.sourceUrl ??
    source?.source?.sourceUrl ??
    source?.website ??
    source?.officialWebsite ??
    null
  );
}

function factsWebsiteValue(research) {
  const w = research?.facts?.website;
  if (typeof w === 'string' && w.trim()) return w;
  if (w && typeof w === 'object') {
    const value = w.value ?? w.sourceUrl ?? null;
    return typeof value === 'string' && value.trim() ? value : null;
  }
  return null;
}

function placeWebsiteOf(source) {
  const raw = source?.raw ?? source?.source?.raw ?? {};
  const url = raw.website ?? raw.url ?? null;
  return typeof url === 'string' && url.trim() ? url : null;
}

function isMapsUrl(url) {
  return MAPS_URL_RE.test(String(url ?? ''));
}

/**
 * Official website was provided, crawled, or present on a matched Place.
 * `sourcesUsed` may be flat sources or `{ source: { sourceType, sourceUrl } }` matches.
 */
export function isOfficialWebsiteResolved(websiteProvided, sources, research) {
  if (websiteProvided) return true;
  if (factsWebsiteValue(research)) return true;
  if (!Array.isArray(sources)) return false;
  return sources.some((s) => {
    if (sourceTypeOf(s) === 'official_website') return true;
    const url = sourceUrlOf(s);
    if (url && !isMapsUrl(url) && sourceTypeOf(s) !== 'google_business' && sourceTypeOf(s) !== 'manual') {
      return true;
    }
    const placeSite = placeWebsiteOf(s);
    return Boolean(placeSite) && !isMapsUrl(placeSite);
  });
}

/**
 * @param {object} args
 * @returns {{
 *   selectedAuthority: 'sourced'|'sourced_pending_review'|'suggested_fallback'|'template_fallback'|'preloaded',
 *   fallbackReason: string|null,
 *   researchAttempted: boolean,
 *   researchStatus: string,
 *   researchItemCount: number,
 *   ownerReviewRequired: boolean,
 *   websiteProvided: boolean,
 *   websiteResolved: boolean,
 *   researchPipelineEnabled: boolean,
 *   stagedSourcedCatalogEnabled: boolean,
 * }}
 */
export function resolveCatalogAuthorityDecision({
  params = {},
  input = {},
  research = null,
  researchAttempted = false,
  researchException = false,
  fromPreload = false,
  placesConfigured = null,
} = {}) {
  const fields = resolveStoreResearchInputFields(params, input);
  const websiteProvided = Boolean(fields.website);
  const sources = Array.isArray(research?.sourcesUsed) ? research.sourcesUsed : [];
  const websiteResolved = isOfficialWebsiteResolved(websiteProvided, sources, research);
  const researchPipelineEnabled = isStoreResearchPipelineEnabled();
  const stagedSourcedCatalogEnabled = isStageSourcedCatalogPendingReviewEnabled();
  const ownerReviewRequired = isResearchCatalogPendingOwnerReview(research);
  const researchItemCount = countResearchItems(research);
  const researchStatus = researchException
    ? 'exception'
    : !researchAttempted
      ? 'not_attempted'
      : research?.fallbackToGenerated
        ? 'fallback'
        : researchHasCatalogItems(research)
          ? 'items'
          : 'empty';

  if (fromPreload && !researchAttempted) {
    return emit({
      selectedAuthority: 'preloaded',
      fallbackReason: CATALOG_FALLBACK_REASONS.PRELOADED_CATALOG,
      researchAttempted,
      researchStatus,
      researchItemCount,
      ownerReviewRequired,
      websiteProvided,
      websiteResolved,
      researchPipelineEnabled,
      stagedSourcedCatalogEnabled,
      missionId: fields.missionId,
      draftStoreId: fields.draftId,
      params,
    });
  }

  if (researchException) {
    return emit({
      selectedAuthority: 'suggested_fallback',
      fallbackReason: CATALOG_FALLBACK_REASONS.RESEARCH_EXCEPTION,
      researchAttempted: true,
      researchStatus,
      researchItemCount,
      ownerReviewRequired,
      websiteProvided,
      websiteResolved,
      researchPipelineEnabled,
      stagedSourcedCatalogEnabled,
      missionId: fields.missionId,
      draftStoreId: fields.draftId,
      params,
    });
  }

  if (researchAttempted && shouldApplyResearchCatalogToDraft(research)) {
    const selectedAuthority = ownerReviewRequired ? 'sourced_pending_review' : 'sourced';
    return emit({
      selectedAuthority,
      fallbackReason: null,
      researchAttempted,
      researchStatus,
      researchItemCount,
      ownerReviewRequired,
      websiteProvided,
      websiteResolved,
      researchPipelineEnabled,
      stagedSourcedCatalogEnabled,
      missionId: fields.missionId,
      draftStoreId: fields.draftId,
      params,
    });
  }

  const fallbackReason = resolveFallbackReason({
    research,
    researchAttempted,
    researchPipelineEnabled,
    stagedSourcedCatalogEnabled,
    ownerReviewRequired,
    researchItemCount,
    websiteProvided,
    websiteResolved,
    placesConfigured,
  });

  return emit({
    selectedAuthority: 'suggested_fallback',
    fallbackReason,
    researchAttempted,
    researchStatus,
    researchItemCount,
    ownerReviewRequired,
    websiteProvided,
    websiteResolved,
    researchPipelineEnabled,
    stagedSourcedCatalogEnabled,
    missionId: fields.missionId,
    draftStoreId: fields.draftId,
    params,
  });
}

function countResearchItems(research) {
  if (!research) return 0;
  if (Array.isArray(research.catalog?.products)) return research.catalog.products.length;
  if (Array.isArray(research.extractedItems)) return research.extractedItems.length;
  const facts = research.facts;
  if (!facts || typeof facts !== 'object') return 0;
  let n = 0;
  for (const key of ['services', 'menuItems', 'products']) {
    if (Array.isArray(facts[key])) n += facts[key].length;
  }
  return n;
}

function resolveFallbackReason({
  research,
  researchAttempted,
  researchPipelineEnabled,
  stagedSourcedCatalogEnabled,
  ownerReviewRequired,
  researchItemCount,
  websiteProvided,
  websiteResolved,
  placesConfigured,
}) {
  if (!researchAttempted) {
    if (!researchPipelineEnabled && process.env.NODE_ENV === 'production') {
      return CATALOG_FALLBACK_REASONS.RESEARCH_PIPELINE_DISABLED;
    }
    return CATALOG_FALLBACK_REASONS.RESEARCH_NOT_ATTEMPTED;
  }
  if (ownerReviewRequired && researchItemCount > 0 && !stagedSourcedCatalogEnabled) {
    return CATALOG_FALLBACK_REASONS.OWNER_REVIEW_STAGING_DISABLED;
  }
  if (placesConfigured === false && !websiteProvided) {
    return CATALOG_FALLBACK_REASONS.PLACES_NOT_CONFIGURED;
  }
  if (research?.fallbackToGenerated && researchItemCount === 0) {
    if (!websiteResolved && !websiteProvided) return CATALOG_FALLBACK_REASONS.WEBSITE_NOT_FOUND;
    return CATALOG_FALLBACK_REASONS.NO_CATALOG_CONTENT_FOUND;
  }
  if (researchItemCount === 0) return CATALOG_FALLBACK_REASONS.RESEARCH_RESULT_EMPTY;
  if (Number(research?.confidence ?? 0) > 0 && Number(research.confidence) < 0.55) {
    return CATALOG_FALLBACK_REASONS.RESEARCH_CONFIDENCE_TOO_LOW;
  }
  if (!websiteResolved) return CATALOG_FALLBACK_REASONS.WEBSITE_NOT_FOUND;
  return CATALOG_FALLBACK_REASONS.NO_CATALOG_CONTENT_FOUND;
}

function emit(decision) {
  const event = {
    event: 'store.catalog.authority_selected',
    missionId: decision.missionId ?? null,
    draftStoreId: decision.draftStoreId ?? null,
    researchPipelineEnabled: decision.researchPipelineEnabled,
    stagedSourcedCatalogEnabled: decision.stagedSourcedCatalogEnabled,
    websiteProvided: decision.websiteProvided,
    websiteResolved: decision.websiteResolved,
    researchAttempted: decision.researchAttempted,
    researchStatus: decision.researchStatus,
    researchItemCount: decision.researchItemCount,
    ownerReviewRequired: decision.ownerReviewRequired,
    selectedAuthority: decision.selectedAuthority,
    fallbackReason: decision.fallbackReason,
  };
  console.log(JSON.stringify(event));
  return {
    selectedAuthority: decision.selectedAuthority,
    fallbackReason: decision.fallbackReason,
    researchAttempted: decision.researchAttempted,
    researchStatus: decision.researchStatus,
    researchItemCount: decision.researchItemCount,
    ownerReviewRequired: decision.ownerReviewRequired,
    websiteProvided: decision.websiteProvided,
    websiteResolved: decision.websiteResolved,
    researchPipelineEnabled: decision.researchPipelineEnabled,
    stagedSourcedCatalogEnabled: decision.stagedSourcedCatalogEnabled,
  };
}

/**
 * @param {object} catalog
 * @param {{ selectedAuthority: string, fallbackReason?: string|null, ownerReviewRequired?: boolean }} decision
 */
export function attachCatalogGrounding(catalog, decision) {
  if (!catalog || typeof catalog !== 'object') return catalog;
  const products = Array.isArray(catalog.products) ? catalog.products : [];
  let sourcedCount = 0;
  let suggestedCount = 0;
  for (const p of products) {
    const origin = String(p?.contentOrigin ?? '').toLowerCase();
    if (origin === 'sourced') sourcedCount += 1;
    else suggestedCount += 1;
  }
  const totalCount = products.length;
  const groundedRatio = totalCount > 0 ? sourcedCount / totalCount : 0;
  let authority = 'suggested';
  if (sourcedCount > 0 && suggestedCount === 0) authority = 'sourced';
  else if (sourcedCount > 0 && suggestedCount > 0) authority = 'mixed';

  const grounding = {
    sourcedCount,
    suggestedCount,
    totalCount,
    groundedRatio: Math.round(groundedRatio * 1000) / 1000,
    authority,
    ownerReviewRequired: Boolean(decision.ownerReviewRequired),
    ...(decision.fallbackReason ? { fallbackReason: decision.fallbackReason } : {}),
  };

  return {
    ...catalog,
    meta: {
      ...(catalog.meta && typeof catalog.meta === 'object' ? catalog.meta : {}),
      catalogAuthority: decision.selectedAuthority,
      catalogGrounding: grounding,
      ...(decision.fallbackReason ? { catalogFallbackReason: decision.fallbackReason } : {}),
    },
  };
}
