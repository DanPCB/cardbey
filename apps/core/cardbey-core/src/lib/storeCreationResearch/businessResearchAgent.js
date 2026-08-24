/**
 * Research-backed store creation orchestrator for Performer.
 */

import { discoverSources } from './sourceDiscoveryService.js';
import {
  scoreSourceMatch,
  aggregateResearchConfidence,
  attachOfficialWebsiteWhenGbpMatches,
} from './sourceConfidenceScorer.js';
import { extractBusinessFacts } from './businessFactsExtractor.js';
import { extractServiceMenuCatalog } from './serviceMenuExtractor.js';
import {
  filterCatalogItemsByOfferingLabel,
  catalogLooksLikeNavChrome,
} from '../mission001/offeringReconstruction/offeringLabelQuality.js';
import { buildResearchBackedStore } from './researchBackedStoreBuilder.js';
import {
  saveResearchEvidence,
  persistResearchToMission,
} from './researchEvidenceRepository.js';
import { resolveStoreResearchInputFields, shouldRunStoreCreationResearchFromFields } from './researchInputFields.js';
import {
    isGooglePlacesConfigured,
    getGooglePlacesApiMode,
} from '../businessDiscovery/businessDiscoverySources.js';
import { CONFIDENCE, RESEARCH_LOG } from './types.js';
import { buildResearchEvidenceSnapshot } from '../researchEvidence/researchEvidenceRepository.js';
import { normalizeLegacyMatchToProviderResult } from '../researchEvidence/providerResultNormalizer.js';

function enrichItemsWithEvidence(items = [], researchEvidence) {
  if (!Array.isArray(items) || !researchEvidence?.mergedEvidence?.catalogItems) return items;
  return items.map((item) => {
    const match = researchEvidence.mergedEvidence.catalogItems.find(
      (candidate) =>
        candidate?.name &&
        item?.name &&
        String(candidate.name).trim().toLowerCase() === String(item.name).trim().toLowerCase(),
    );
    return match
      ? {
          ...item,
          providerId: match.providerId ?? null,
          providerName: match.providerName ?? null,
          tier: match.tier ?? null,
          ownerVerifiedStatus: match.ownerVerifiedStatus ?? null,
          conflict: Boolean(match.conflict),
          conflictingValues: Array.isArray(match.conflictingValues) ? match.conflictingValues : [],
        }
      : item;
  });
}

/**
 * Whether research should run before catalog generation.
 * @param {object} params
 * @param {object} [input]
 */
export function shouldRunStoreCreationResearch(params = {}, input = {}) {
  return shouldRunStoreCreationResearchFromFields(params, input);
}

/**
 * Route through canonical storeResearch pipeline when enabled.
 * @param {import('./types.js').StoreCreationResearchInput} input
 * @param {{ prisma?: import('@prisma/client').PrismaClient, skipNetwork?: boolean }} [options]
 */
async function maybeRunViaStoreResearchPipeline(input, options) {
  if (options?.skipStoreResearchPipeline === true) return null;
  try {
    const { isStoreResearchPipelineEnabled, runStoreResearchPipeline } = await import('../storeResearch/index.js');
    if (!isStoreResearchPipelineEnabled()) return null;
    const pipeline = await runStoreResearchPipeline(
      { ...input, allowSuggestedContent: false },
      options,
    );
    if (pipeline.legacyResearchResult) {
      return {
        ...pipeline.legacyResearchResult,
        storeResearchPipeline: {
          mode: pipeline.mode,
          entityResolution: pipeline.entityResolution,
          reviewArtifact: pipeline.reviewArtifact,
          missionContract: pipeline.missionContract,
          evidence: pipeline.evidence,
        },
      };
    }
    if (pipeline.mode === 'ambiguous_entity') {
      return {
        researchRan: true,
        fallbackToGenerated: false,
        ownerReviewRequired: true,
        confidence: pipeline.entityResolution?.confidence ?? 0,
        facts: null,
        businessProfile: null,
        catalog: null,
        sourcesUsed: [],
        sourcesPendingConfirmation: [],
        extractedItems: [],
        logs: pipeline.logs,
        storeResearchPipeline: {
          mode: pipeline.mode,
          entityResolution: pipeline.entityResolution,
          reviewArtifact: pipeline.reviewArtifact,
        },
      };
    }
    return null;
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[storeCreationResearch] pipeline fallback to legacy:', err?.message ?? err);
    }
    return null;
  }
}

/**
 * @param {import('./types.js').StoreCreationResearchInput} input
 * @param {{ prisma?: import('@prisma/client').PrismaClient, skipNetwork?: boolean }} [options]
 * @returns {Promise<import('./types.js').BusinessResearchResult>}
 */
export async function runStoreCreationResearch(input, options = {}) {
  const piped = await maybeRunViaStoreResearchPipeline(input, options);
  if (piped) return piped;

  const normalizedInput = resolveStoreResearchInputFields({}, input);
  const logs = [];
  const log = (msg, meta) => {
    logs.push(msg);
    if (process.env.NODE_ENV !== 'production') {
      console.log(msg, meta ?? '');
    }
  };

  log(RESEARCH_LOG.STARTED, {
    businessName: normalizedInput.businessName ?? null,
    hasWebsite: Boolean(normalizedInput.website),
    hasLocation: Boolean(normalizedInput.location),
    hasCategory: Boolean(normalizedInput.category),
    googlePlacesConfigured: isGooglePlacesConfigured(),
    googlePlacesApiMode: isGooglePlacesConfigured() ? getGooglePlacesApiMode() : 'disabled',
  });

  /** @type {import('./types.js').BusinessResearchResult} */
  const emptyResult = {
    researchRan: true,
    fallbackToGenerated: true,
    ownerReviewRequired: false,
    confidence: 0,
    facts: null,
    businessProfile: null,
    catalog: null,
    sourcesUsed: [],
    sourcesPendingConfirmation: [],
    logs,
  };

  if (options.skipNetwork) {
    log(RESEARCH_LOG.FALLBACK, { reason: 'skipNetwork' });
    return {
      ...emptyResult,
      researchEvidence: buildResearchEvidenceSnapshot({
        input: normalizedInput,
        discoveredSources: [],
        scoredSources: [],
        result: emptyResult,
      }),
    };
  }

  const discovered = await discoverSources(normalizedInput, log);
  if (!discovered.length) {
    log(RESEARCH_LOG.FALLBACK, { reason: 'no_sources' });
    const result = { ...emptyResult, ownerReviewRequired: true };
    result.researchEvidence = buildResearchEvidenceSnapshot({
      input: normalizedInput,
      discoveredSources: discovered,
      scoredSources: [],
      result,
    });
    saveResearchEvidence(normalizedInput, result);
    if (options.prisma && normalizedInput.missionId) {
      await persistResearchToMission(options.prisma, normalizedInput.missionId, result, {
        draftId: normalizedInput.draftId ?? null,
        input: normalizedInput,
        discoveredSources: discovered,
        scoredSources: [],
      });
    }
    return result;
  }

  const scoredInitial = discovered.map((source) => {
    const match = scoreSourceMatch(source, normalizedInput);
    match.researchProvider = normalizeLegacyMatchToProviderResult(match);
    if (match.matched) {
      log(RESEARCH_LOG.SOURCE_MATCHED, {
        sourceType: source.sourceType,
        confidence: match.confidence,
        reasons: match.reasons,
      });
    }
    return match;
  });
  const scored = attachOfficialWebsiteWhenGbpMatches(scoredInitial);
  for (let i = 0; i < scored.length; i++) {
    if (scored[i]?.matched && !scoredInitial[i]?.matched) {
      log(RESEARCH_LOG.SOURCE_MATCHED, {
        sourceType: scored[i].source?.sourceType,
        confidence: scored[i].confidence,
        reasons: scored[i].reasons,
      });
    }
    if (scored[i] !== scoredInitial[i]) {
      scored[i].researchProvider = normalizeLegacyMatchToProviderResult(scored[i]);
    }
  }

  const sourcesUsed = scored.filter((m) => m.matched && m.confidence >= CONFIDENCE.REJECT);
  const sourcesPendingConfirmation = scored.filter(
    (m) => m.matched && m.confidence >= CONFIDENCE.REJECT && m.confidence < CONFIDENCE.USE,
  );

  if (!sourcesUsed.length) {
    log(RESEARCH_LOG.FALLBACK, { reason: 'no_matched_sources' });
    const result = {
      ...emptyResult,
      sourcesPendingConfirmation: scored.filter((m) => !m.matched || m.confidence < CONFIDENCE.REJECT),
      ownerReviewRequired: true,
      scoredSources: scored,
    };
    result.researchEvidence = buildResearchEvidenceSnapshot({
      input: normalizedInput,
      discoveredSources: discovered,
      scoredSources: scored,
      result,
    });
    saveResearchEvidence(normalizedInput, result);
    if (options.prisma && normalizedInput.missionId) {
      await persistResearchToMission(options.prisma, normalizedInput.missionId, result, {
        draftId: normalizedInput.draftId ?? null,
        input: normalizedInput,
        discoveredSources: discovered,
        scoredSources: scored,
      });
    }
    return result;
  }

  const confidence = aggregateResearchConfidence(sourcesUsed);
  const facts = extractBusinessFacts(sourcesUsed, normalizedInput);
  log(RESEARCH_LOG.FACTS_EXTRACTED, { confidence, fields: Object.keys(facts) });

  const { items: structuredRaw, businessKind } = extractServiceMenuCatalog(
    facts,
    sourcesUsed,
    normalizedInput,
  );
  const structuredClean = filterCatalogItemsByOfferingLabel(structuredRaw);
  const structuredIsChrome = catalogLooksLikeNavChrome(structuredRaw);
  let items = structuredIsChrome ? [] : structuredClean;
  let offeringReconstructionDebug = null;
  let catalogAuthoritySource = items.length
    ? 'STRUCTURED_CATALOG'
    : 'SPARSE_NO_EVIDENCE';
  log(RESEARCH_LOG.CATALOG_EXTRACTED, {
    itemCount: items.length,
    businessKind,
    structuredRaw: structuredRaw.length,
    structuredClean: structuredClean.length,
    structuredRejectedAsChrome: structuredIsChrome,
  });

  if (!items.length) {
    try {
      const {
        reconstructOfferingsFromWebsite,
        resolveWebsiteUrlForReconstruction,
      } = await import('../mission001/offeringReconstruction/semanticOfferingReconstruction.js');
      const websiteUrl = resolveWebsiteUrlForReconstruction(normalizedInput, sourcesUsed, facts);
      if (websiteUrl) {
        const reconstructed = await reconstructOfferingsFromWebsite({
          websiteUrl,
          businessName: normalizedInput.businessName,
          category: normalizedInput.category,
          vertical: normalizedInput.category,
          businessKind,
        });
        offeringReconstructionDebug = reconstructed.debug;
        const semanticClean = filterCatalogItemsByOfferingLabel(reconstructed.items ?? []);
        if (semanticClean.length) {
          items = semanticClean;
          catalogAuthoritySource = 'SEMANTIC_WEBSITE_OFFERINGS';
          // Keep facts in sync for downstream builders
          if (businessKind === 'food_menu') facts.menuItems = items;
          else if (businessKind === 'product_retail') facts.products = items;
          else facts.services = items;
          log(RESEARCH_LOG.CATALOG_EXTRACTED, {
            itemCount: items.length,
            businessKind,
            via: 'semantic_website_offerings',
          });
        }
      }
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[storeCreationResearch] semantic offering reconstruction failed', err?.message ?? err);
      }
    }
  } else if (structuredClean.length < structuredRaw.length) {
    // Structured won but drop chrome labels from the accepted set
    items = structuredClean;
    if (businessKind === 'food_menu') facts.menuItems = items;
    else if (businessKind === 'product_retail') facts.products = items;
    else facts.services = items;
  }

  const ownerReviewRequired =
    confidence < CONFIDENCE.USE ||
    sourcesPendingConfirmation.length > 0 ||
    items.some((i) => i.needsOwnerReview);

  if (ownerReviewRequired) {
    log(RESEARCH_LOG.OWNER_REVIEW, {
      confidence,
      pendingSources: sourcesPendingConfirmation.length,
    });
  }

  if (!items.length) {
    log(RESEARCH_LOG.FALLBACK, { reason: 'no_catalog_items' });
    const result = {
      ...emptyResult,
      confidence,
      facts,
      sourcesUsed,
      sourcesPendingConfirmation,
      ownerReviewRequired: true,
      extractedItems: items,
      scoredSources: scored,
      offeringReconstruction: offeringReconstructionDebug,
      catalogAuthoritySource: 'SPARSE_NO_EVIDENCE',
    };
    result.researchEvidence = buildResearchEvidenceSnapshot({
      input: normalizedInput,
      discoveredSources: discovered,
      scoredSources: scored,
      result,
    });
    result.extractedItems = enrichItemsWithEvidence(result.extractedItems, result.researchEvidence);
    saveResearchEvidence(normalizedInput, result);
    if (options.prisma && normalizedInput.missionId) {
      await persistResearchToMission(options.prisma, normalizedInput.missionId, result, {
        draftId: normalizedInput.draftId ?? null,
        input: normalizedInput,
        discoveredSources: discovered,
        scoredSources: scored,
      });
    }
    return result;
  }

  const built = buildResearchBackedStore({
    facts,
    items,
    businessKind,
    input: normalizedInput,
    confidence,
  });
  if (built?.catalog?.meta) {
    built.catalog.meta.catalogAuthoritySource = catalogAuthoritySource;
  }

  const result = {
    researchRan: true,
    fallbackToGenerated: false,
    ownerReviewRequired,
    confidence,
    facts,
    businessProfile: built.businessProfile,
    catalog: built.catalog,
    sourcesUsed,
    sourcesPendingConfirmation,
    extractedItems: items,
    scoredSources: scored,
    logs,
    offeringReconstruction: offeringReconstructionDebug,
    catalogAuthoritySource,
  };
  result.researchEvidence = buildResearchEvidenceSnapshot({
    input: normalizedInput,
    discoveredSources: discovered,
    scoredSources: scored,
    result,
  });
  result.extractedItems = enrichItemsWithEvidence(result.extractedItems, result.researchEvidence);

  saveResearchEvidence(normalizedInput, result);
  if (options.prisma && normalizedInput.missionId) {
    await persistResearchToMission(options.prisma, normalizedInput.missionId, result, {
      draftId: normalizedInput.draftId ?? null,
      input: normalizedInput,
      discoveredSources: discovered,
      scoredSources: scored,
    });
  }

  return result;
}
