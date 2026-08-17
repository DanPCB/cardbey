/**
 * Research-backed store creation pipeline — canonical orchestrator.
 *
 * Existing business: entity resolution → sources → extract → reconcile → owner review
 * New business: delegate to legacy research (no entity) or industry blueprint path
 */

import { resolveBusinessEntity, isExistingBusinessIntent } from './businessEntityResolver.js';
import { discoverBusinessSources } from './sourceDiscoveryService.js';
import { runBusinessSourceExtractors } from './extractors/index.js';
import { reconcileBusinessEvidence } from './businessEvidenceReconciler.js';
import { normalizeResearchCatalog, markSuggestedCatalogItems } from './catalogNormalizers/index.js';
import { buildStoreResearchReviewArtifact, canPersistStoreDraftFromResearch } from './ownerReviewArtifact.js';
import { buildStoreCreationMissionContract } from './missionContract.js';
import {
  buildStoreResearchProvenance,
  persistStoreResearchProvenance,
} from './provenancePersistence.js';
import {
  runStoreCreationResearch as legacyRunStoreCreationResearch,
  shouldRunStoreCreationResearch as legacyShouldRun,
} from '../storeCreationResearch/businessResearchAgent.js';
import { resolveStoreResearchInputFields } from '../storeCreationResearch/researchInputFields.js';

function envTruthy(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') return defaultValue;
  const v = String(raw).trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export function isStoreResearchPipelineEnabled() {
  if (process.env.ENABLE_STORE_RESEARCH_PIPELINE !== undefined) {
    return envTruthy('ENABLE_STORE_RESEARCH_PIPELINE', false);
  }
  return process.env.NODE_ENV !== 'production';
}

/**
 * @param {import('./types.js').StoreResearchPipelineInput} input
 * @param {{ prisma?: import('@prisma/client').PrismaClient, skipNetwork?: boolean }} [options]
 * @returns {Promise<import('./types.js').StoreResearchPipelineResult>}
 */
export async function runStoreResearchPipeline(input, options = {}) {
  const logs = [];
  const log = (msg, meta) => {
    logs.push(msg);
    if (process.env.NODE_ENV !== 'production') console.log('[storeResearch]', msg, meta ?? '');
  };

  const legacyOptions = { ...options, skipStoreResearchPipeline: true };

  const normalized = resolveStoreResearchInputFields({}, input);
  const entityInput = {
    businessName: normalized.businessName ?? '',
    location: normalized.location,
    websiteHint: normalized.website,
    phoneHint: normalized.phone,
  };

  const existingIntent = isExistingBusinessIntent(entityInput);

  if (!existingIntent) {
    log('new_business_path', { businessName: normalized.businessName });
    const legacy = await legacyRunStoreCreationResearch(normalized, legacyOptions);
    return {
      mode: 'new_business',
      entityResolution: {
        candidates: [],
        confidence: 0,
        requiresOwnerConfirmation: false,
        resolutionNotes: ['No location/contact signals — industry starter catalog path'],
      },
      evidence: null,
      reviewArtifact: null,
      missionContract: null,
      legacyResearchResult: legacy,
      ownerReviewRequired: Boolean(legacy?.ownerReviewRequired),
      fallbackToGenerated: Boolean(legacy?.fallbackToGenerated ?? true),
      logs: [...logs, ...(legacy?.logs ?? [])],
    };
  }

  log('existing_business_path', entityInput);
  const entityResolution = await resolveBusinessEntity(entityInput);

  if (!entityResolution.candidates.length) {
    log('no_entity_match_fallback_new');
    const legacy = await legacyRunStoreCreationResearch(normalized, legacyOptions);
    return {
      mode: 'new_business',
      entityResolution,
      evidence: null,
      reviewArtifact: null,
      missionContract: null,
      legacyResearchResult: legacy,
      ownerReviewRequired: true,
      fallbackToGenerated: true,
      logs,
    };
  }

  if (entityResolution.candidates.length > 1 && entityResolution.requiresOwnerConfirmation) {
    const reviewArtifact = buildStoreResearchReviewArtifact({
      missionId: normalized.missionId ?? '',
      draftId: normalized.draftId ?? null,
      entityResolution,
      evidence: null,
      sources: [],
      suggestedItems: [],
    });
    return {
      mode: 'ambiguous_entity',
      entityResolution,
      evidence: null,
      reviewArtifact,
      missionContract: null,
      legacyResearchResult: null,
      ownerReviewRequired: true,
      fallbackToGenerated: false,
      logs,
    };
  }

  const selected = entityResolution.selectedCandidate ?? entityResolution.candidates[0];
  const enrichedInput = {
    ...normalized,
    businessName: selected?.name ?? normalized.businessName,
    location: selected?.location ?? normalized.location,
    website: selected?.website ?? normalized.website,
    phone: selected?.phone ?? normalized.phone,
  };

  const sources = options.skipNetwork ? [] : await discoverBusinessSources(enrichedInput, log);
  const legacy = await legacyRunStoreCreationResearch(enrichedInput, legacyOptions);

  // Extractor payloads are not merged into catalog (legacyResearchResult is authority).
  // Skip the extra website crawl unless explicitly opted in.
  if (envTruthy('STORE_RESEARCH_RUN_EXTRACTORS', false) && !options.skipNetwork) {
    await runBusinessSourceExtractors(sources, enrichedInput, legacy?.scoredSources ?? []);
  }

  const providerResults = legacy?.researchEvidence?.providerResults ?? [];
  const businessKind = legacy?.businessProfile?.businessKind ?? legacy?.catalog?.meta?.businessKind ?? 'services';

  const { evidence, suggestedItems } = reconcileBusinessEvidence({
    providerResults,
    entityId: selected?.entityId ?? null,
    suggestedCatalogItems: input.allowSuggestedContent
      ? markSuggestedCatalogItems(legacy?.extractedItems ?? [])
      : [],
  });

  if (evidence?.catalogItems?.length) {
    evidence.catalogItems = normalizeResearchCatalog(evidence.catalogItems, businessKind);
  }

  const reviewArtifact = buildStoreResearchReviewArtifact({
    missionId: normalized.missionId ?? '',
    draftId: normalized.draftId ?? null,
    entityResolution,
    evidence,
    sources,
    suggestedItems: input.allowSuggestedContent ? suggestedItems : [],
  });

  const missionContract = buildStoreCreationMissionContract({
    evidenceId: evidence?.evidenceId ?? '',
    entityId: selected?.entityId ?? null,
    selectedBusinessCandidate: selected ?? null,
    approvedSources: sources.map((s) => s.id),
    executionContext: {
      missionId: normalized.missionId ?? null,
      draftId: normalized.draftId ?? null,
      storeName: enrichedInput.businessName ?? null,
    },
    contentPolicy: {
      sourcedFieldsApproved: false,
      suggestedFieldsApproved: false,
    },
  });

  const provenance = buildStoreResearchProvenance({
    evidence,
    sources,
    fieldProvenance: Object.fromEntries(
      Object.entries(evidence?.profile ?? {}).map(([k, v]) => [k, v?.sources ?? []]),
    ),
  });

  if (options.prisma && normalized.missionId) {
    await persistStoreResearchProvenance(options.prisma, normalized.missionId, {
      provenance,
      missionContract,
      reviewArtifact,
      legacyResearchResult: legacy,
      ownerReviewRequired: true,
    });
  }

  const ownerReviewRequired =
    Boolean(legacy?.ownerReviewRequired) ||
    reviewArtifact.requiresOwnerConfirmation ||
    !canPersistStoreDraftFromResearch(reviewArtifact, false);

  return {
    mode: 'existing_business',
    entityResolution,
    evidence,
    reviewArtifact,
    missionContract,
    legacyResearchResult: legacy,
    ownerReviewRequired,
    fallbackToGenerated: Boolean(legacy?.fallbackToGenerated),
    logs: [...logs, ...(legacy?.logs ?? [])],
  };
}

export function shouldRunStoreResearch(input, rawInput = {}) {
  return legacyShouldRun(input, rawInput);
}
