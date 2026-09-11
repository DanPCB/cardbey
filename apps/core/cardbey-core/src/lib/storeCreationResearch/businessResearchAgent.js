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
import {
  isVerifiedResearchMatch,
  summarizeMatchSignals,
  reportExtractedResearchFields,
  appendPathABlackboardEvent,
  persistResearchQualityToMission,
} from './pathAResearchQuality.js';

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

  // Website-first: scrape URL before Places when provided.
  let skipGooglePlaces = false;
  let websiteScrapeMeta = null;
  if (normalizedInput.website) {
    try {
      const { extractFromWebsite } = await import('../businessDiscovery/businessDiscoverySources.js');
      const websiteUrl = String(normalizedInput.website).trim();
      const webResults = await extractFromWebsite(websiteUrl);
      const offerCount = webResults.reduce(
        (n, r) => n + (Array.isArray(r?.raw?.offers) ? r.raw.offers.length : 0),
        0,
      );
      const preliminary = webResults.map((r, i) => {
        const source = {
          sourceType: 'official_website',
          sourceUrl: websiteUrl,
          raw: r.raw ?? {},
          priority: i,
        };
        const match = scoreSourceMatch(source, normalizedInput);
        match.researchProvider = normalizeLegacyMatchToProviderResult(match);
        return match;
      });
      const verifiedWeb = preliminary.filter(isVerifiedResearchMatch);
      const success = verifiedWeb.length > 0 && offerCount > 0;
      let fieldsExtracted = [];
      if (success) {
        const webFacts = extractBusinessFacts(verifiedWeb, normalizedInput);
        fieldsExtracted = reportExtractedResearchFields(webFacts).fieldsExtracted;
      }
      websiteScrapeMeta = {
        url: websiteUrl,
        success,
        itemCount: offerCount,
        fieldsExtracted,
      };
      console.log('[store-website-scrape]', websiteScrapeMeta);
      await appendPathABlackboardEvent(normalizedInput.missionId, 'store:website_scraped', {
        draftId: normalizedInput.draftId ?? null,
        url: websiteUrl,
        itemCount: offerCount,
        success,
        fieldsExtracted: websiteScrapeMeta.fieldsExtracted,
      });
      if (success) {
        skipGooglePlaces = true;
      }
    } catch (webErr) {
      console.warn('[store-website-scrape] failed (non-fatal):', webErr?.message ?? webErr);
    }
  }

  const discovered = await discoverSources(normalizedInput, log, { skipGooglePlaces });
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

  // Path A gate: only USE + strong identity evidence.
  const sourcesUsed = scored.filter(isVerifiedResearchMatch);
  const sourcesPendingConfirmation = scored.filter(
    (m) =>
      typeof m.confidence === 'number' &&
      m.confidence >= CONFIDENCE.REJECT &&
      m.confidence < CONFIDENCE.USE,
  );
  const topCandidate = [...scored].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0] ?? null;

  if (!sourcesUsed.length) {
    if (topCandidate && topCandidate.confidence >= CONFIDENCE.REJECT && topCandidate.confidence < CONFIDENCE.USE) {
      console.log('[store-research-low-confidence]', {
        confidence: topCandidate.confidence,
        reason: topCandidate.reasons?.[0] ?? 'below_use_threshold',
        missionId: normalizedInput.missionId ?? null,
      });
      await appendPathABlackboardEvent(normalizedInput.missionId, 'store:research_uncertain', {
        draftId: normalizedInput.draftId ?? null,
        confidence: topCandidate.confidence,
        topCandidate: {
          sourceType: topCandidate.source?.sourceType ?? null,
          name: topCandidate.source?.raw?.name ?? null,
          reasons: topCandidate.reasons ?? [],
        },
      });
      await persistResearchQualityToMission(options.prisma, normalizedInput.missionId, {
        mode: 'research',
        lowConfidenceFallback: true,
        confidence: topCandidate.confidence,
        businessName: normalizedInput.businessName ?? null,
      });
    }
    log(RESEARCH_LOG.FALLBACK, { reason: 'no_verified_sources' });
    const result = {
      ...emptyResult,
      sourcesPendingConfirmation,
      ownerReviewRequired: true,
      scoredSources: scored,
      lowConfidenceFallback: true,
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
  const fieldReport = reportExtractedResearchFields(facts);
  log(RESEARCH_LOG.FACTS_EXTRACTED, { confidence, fields: fieldReport.fieldsExtracted });

  const topVerified = sourcesUsed[0];
  const signals = summarizeMatchSignals(topVerified);
  await appendPathABlackboardEvent(normalizedInput.missionId, 'store:research_matched', {
    draftId: normalizedInput.draftId ?? null,
    confidence,
    source: topVerified.source?.sourceType ?? null,
    nameMatched: signals.nameMatched,
    websiteMatched: signals.websiteMatched,
    phoneMatched: signals.phoneMatched,
  });
  await appendPathABlackboardEvent(normalizedInput.missionId, 'store:research_data_extracted', {
    draftId: normalizedInput.draftId ?? null,
    fieldsExtracted: fieldReport.fieldsExtracted,
    fieldsMissing: fieldReport.fieldsMissing,
    source: topVerified.source?.sourceType ?? null,
    confidence,
  });

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
  let catalogSourceLabel = items.length ? 'scraped' : null;
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
          businessName: facts.businessName?.value ?? normalizedInput.businessName,
          category: facts.category?.value ?? normalizedInput.category,
          vertical: facts.category?.value ?? normalizedInput.category,
          businessKind,
        });
        offeringReconstructionDebug = reconstructed.debug;
        const semanticClean = filterCatalogItemsByOfferingLabel(reconstructed.items ?? []);
        if (semanticClean.length) {
          items = semanticClean;
          catalogAuthoritySource = 'SEMANTIC_WEBSITE_OFFERINGS';
          catalogSourceLabel = 'scraped';
          if (businessKind === 'food_menu') facts.menuItems = items;
          else if (businessKind === 'product_retail') facts.products = items;
          else facts.services = items;
          console.log('[store-research-catalog-recovered]', {
            itemCount: items.length,
            via: 'semantic_website_offerings',
            url: websiteUrl,
          });
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
    items = structuredClean;
    if (businessKind === 'food_menu') facts.menuItems = items;
    else if (businessKind === 'product_retail') facts.products = items;
    else facts.services = items;
  }

  // High-confidence empty catalog: one website scrape retry, then suggested seed (never empty).
  if (!items.length && confidence >= CONFIDENCE.USE) {
    try {
      const { extractFromWebsite } = await import('../businessDiscovery/businessDiscoverySources.js');
      const retryUrl =
        facts.website?.value ||
        normalizedInput.website ||
        sourcesUsed.find((s) => s.source?.sourceUrl)?.source?.sourceUrl ||
        null;
      if (retryUrl) {
        const retryResults = await extractFromWebsite(String(retryUrl));
        const retryOffers = retryResults.flatMap((r) =>
          Array.isArray(r?.raw?.offers) ? r.raw.offers : [],
        );
        if (retryOffers.length) {
          items = retryOffers.map((o, i) => ({
            name: o.name,
            description: o.description ?? null,
            price: o.price ?? null,
            category: o.category ?? defaultCategoryForKind(businessKind),
            sourceUrl: String(retryUrl),
            sourceType: 'official_website',
            confidence,
            needsOwnerReview: false,
            id: `scrape_retry_${i}`,
          }));
          catalogAuthoritySource = 'WEBSITE_SCRAPE_RETRY';
          catalogSourceLabel = 'scraped';
          console.log('[store-research-catalog-recovered]', {
            itemCount: items.length,
            via: 'website_scrape_retry',
            url: retryUrl,
          });
        }
      }
    } catch (retryErr) {
      console.warn('[store-research-catalog-recovered] scrape retry failed:', retryErr?.message ?? retryErr);
    }
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
    // Never leave a verified real business with an empty catalog — suggested items + verify flag.
    try {
      const { ensureStoreCreationCatalogItems } = await import(
        '../../services/draftStore/ensureStoreCreationCatalogItems.js'
      );
      const { stampSuggestedCatalogOrigin } = await import(
        '../../services/draftStore/researchCatalogDraft.js'
      );
      const seedCatalog = stampSuggestedCatalogOrigin(
        ensureStoreCreationCatalogItems(
          { products: [], items: [], categories: [], meta: {} },
          {
            businessName: facts.businessName?.value ?? normalizedInput.businessName,
            businessType: facts.category?.value ?? normalizedInput.category,
            verticalSlug: normalizedInput.category,
            storeType: facts.category?.value ?? normalizedInput.category,
          },
          normalizedInput,
        ),
      );
      const seedProducts = Array.isArray(seedCatalog.products)
        ? seedCatalog.products
        : Array.isArray(seedCatalog.items)
          ? seedCatalog.items
          : [];
      if (seedProducts.length) {
        items = seedProducts.map((p, i) => ({
          ...p,
          contentOrigin: 'suggested',
          needsOwnerReview: true,
          confidence: Math.min(confidence, 0.5),
          id: p.id ?? `suggested_real_${i}`,
        }));
        catalogAuthoritySource = 'SUGGESTED_FOR_REAL_BUSINESS';
        catalogSourceLabel = 'suggested_for_real_business';
        seedCatalog.meta = {
          ...(seedCatalog.meta ?? {}),
          catalogSource: 'suggested_for_real_business',
          pleaseVerifyMenu: true,
          pleaseVerifyMenuMessage: 'Please verify your menu',
          researchConfidence: confidence,
        };
        const builtSuggested = buildResearchBackedStore({
          facts,
          items,
          businessKind,
          input: {
            ...normalizedInput,
            businessName: facts.businessName?.value ?? normalizedInput.businessName,
            category: facts.category?.value ?? normalizedInput.category,
            location: facts.address?.value ?? normalizedInput.location,
            phone: facts.phone?.value ?? normalizedInput.phone,
            website: facts.website?.value ?? normalizedInput.website,
          },
          confidence,
        });
        if (builtSuggested?.catalog) {
          builtSuggested.catalog.meta = {
            ...(builtSuggested.catalog.meta ?? {}),
            ...(seedCatalog.meta ?? {}),
            catalogAuthoritySource,
            pleaseVerifyMenu: true,
            pleaseVerifyMenuMessage: 'Please verify your menu',
            contentOrigin: 'suggested',
          };
          builtSuggested.catalog.products = (builtSuggested.catalog.products ?? []).map((p) => ({
            ...p,
            contentOrigin: 'suggested',
            needsOwnerReview: true,
          }));
        }
        await appendPathABlackboardEvent(normalizedInput.missionId, 'store:catalog_source', {
          draftId: normalizedInput.draftId ?? null,
          source: 'suggested_for_real_business',
          itemCount: items.length,
          confidence,
        });
        await persistResearchQualityToMission(options.prisma, normalizedInput.missionId, {
          mode: 'research',
          confidence,
          businessName: facts.businessName?.value ?? normalizedInput.businessName,
          address: facts.address?.value ?? null,
          itemCount: items.length,
          catalogSource: 'suggested_for_real_business',
          pleaseVerifyMenu: true,
          fieldsExtracted: fieldReport.fieldsExtracted,
        });
        const resultSuggested = {
          researchRan: true,
          fallbackToGenerated: false,
          ownerReviewRequired: true,
          confidence,
          facts,
          businessProfile: builtSuggested.businessProfile,
          catalog: builtSuggested.catalog,
          sourcesUsed,
          sourcesPendingConfirmation,
          extractedItems: items,
          scoredSources: scored,
          logs,
          offeringReconstruction: offeringReconstructionDebug,
          catalogAuthoritySource,
          catalogSourceLabel,
          pleaseVerifyMenu: true,
          extractedFields: fieldReport.mapped,
        };
        resultSuggested.researchEvidence = buildResearchEvidenceSnapshot({
          input: normalizedInput,
          discoveredSources: discovered,
          scoredSources: scored,
          result: resultSuggested,
        });
        saveResearchEvidence(normalizedInput, resultSuggested);
        if (options.prisma && normalizedInput.missionId) {
          await persistResearchToMission(options.prisma, normalizedInput.missionId, resultSuggested, {
            draftId: normalizedInput.draftId ?? null,
            input: normalizedInput,
            discoveredSources: discovered,
            scoredSources: scored,
          });
        }
        return resultSuggested;
      }
    } catch (seedErr) {
      console.warn('[storeCreationResearch] suggested catalog for real business failed:', seedErr?.message ?? seedErr);
    }

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
      extractedFields: fieldReport.mapped,
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

  await appendPathABlackboardEvent(normalizedInput.missionId, 'store:catalog_source', {
    draftId: normalizedInput.draftId ?? null,
    source: catalogSourceLabel || 'scraped',
    itemCount: items.length,
    confidence,
  });

  const built = buildResearchBackedStore({
    facts,
    items,
    businessKind,
    input: {
      ...normalizedInput,
      businessName: facts.businessName?.value ?? normalizedInput.businessName,
      category: facts.category?.value ?? normalizedInput.category,
      location: facts.address?.value ?? normalizedInput.location,
      phone: facts.phone?.value ?? normalizedInput.phone,
      website: facts.website?.value ?? normalizedInput.website,
    },
    confidence,
  });
  if (built?.catalog?.meta) {
    built.catalog.meta.catalogAuthoritySource = catalogAuthoritySource;
    built.catalog.meta.catalogSourceLabel = catalogSourceLabel || 'scraped';
  }
  // Map verified contact fields onto profile
  if (built?.catalog?.profile) {
    built.catalog.profile = {
      ...built.catalog.profile,
      name: facts.businessName?.value ?? built.catalog.profile.name,
      phone: facts.phone?.value ?? built.catalog.profile.phone,
      website: facts.website?.value ?? built.catalog.profile.website,
      address: facts.address?.value ?? built.catalog.profile.address,
      openingHours: facts.openingHours?.value ?? built.catalog.profile.openingHours,
      tagline:
        (typeof facts.description?.value === 'string' && facts.description.value.length > 50
          ? facts.description.value
          : built.catalog.profile.tagline) ?? built.catalog.profile.tagline,
    };
  }

  await persistResearchQualityToMission(options.prisma, normalizedInput.missionId, {
    mode: 'research',
    confidence,
    businessName: facts.businessName?.value ?? normalizedInput.businessName,
    address: facts.address?.value ?? null,
    itemCount: items.length,
    catalogSource: catalogSourceLabel || 'scraped',
    fieldsExtracted: fieldReport.fieldsExtracted,
    websiteScrape: websiteScrapeMeta,
  });

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
    catalogSourceLabel: catalogSourceLabel || 'scraped',
    extractedFields: fieldReport.mapped,
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

function defaultCategoryForKind(businessKind) {
  if (businessKind === 'food_menu') return 'Menu';
  if (businessKind === 'product_retail') return 'Products';
  return 'Services';
}
