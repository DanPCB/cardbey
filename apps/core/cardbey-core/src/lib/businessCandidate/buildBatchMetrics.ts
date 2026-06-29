/**
 * Batch onboarding metrics — derived from BusinessCandidate runtime state only.
 */

import type {
  BatchOnboardingMetrics,
  BusinessCandidateRecord,
  BusinessCandidateStatus,
} from './types.js';
import { listBusinessCandidatesByBatch } from './candidateRepository.js';
import { countByCrmOverlay, countByPipelineStage } from './crmOverlay.js';
import {
  BATCH001_TARGET_COUNT,
  MELBOURNE_BATCH001_REAL_LOCAL_ID,
  REAL_LOCAL_PILOT_TARGET_COUNT,
} from './batch001Config.js';
import { listSeedRecords } from '../businessIngestion/IngestionRepository.js';
import { listMediaForCandidate } from './media/mediaEvidenceRepository.js';
import { listBriefs } from './brief/briefRepository.js';
import { listClaimIntents } from './claimIntent/claimIntentRepository.js';

const ALL_STATUSES: BusinessCandidateStatus[] = [
  'DISCOVERED',
  'PENDING_QA',
  'FETCHING',
  'READY_FOR_REVIEW',
  'OWNER_CONTACTED',
  'STORE_DRAFT_READY',
  'OWNER_REVIEW',
  'PUBLISHED',
  'ACTIVE',
  'QA_REJECTED',
  'CLAIMABLE',
  'CLAIM_PENDING',
  'VERIFIED',
  'DUPLICATE',
];

function countByStatus(candidates: BusinessCandidateRecord[]): Partial<Record<BusinessCandidateStatus, number>> {
  const out: Partial<Record<BusinessCandidateStatus, number>> = {};
  for (const s of ALL_STATUSES) out[s] = 0;
  for (const c of candidates) {
    out[c.status] = (out[c.status] ?? 0) + 1;
  }
  return out;
}

export async function buildBatchOnboardingMetrics(
  batchId: string,
  targetCount?: number,
): Promise<BatchOnboardingMetrics> {
  const candidates = await listBusinessCandidatesByBatch(batchId);
  const resolvedTarget =
    targetCount ??
    (batchId === MELBOURNE_BATCH001_REAL_LOCAL_ID
      ? REAL_LOCAL_PILOT_TARGET_COUNT
      : BATCH001_TARGET_COUNT);

  if (!candidates.length) {
    return {
      batchId,
      campaignId: batchId,
      targetCount: resolvedTarget,
      total: 0,
      byStatus: {},
      pipeline: countByPipelineStage({}),
      crmOverlay: countByCrmOverlay({}),
      missingMenus: 0,
      missingLogos: 0,
      waitingOwnerReview: 0,
      published: 0,
      active: 0,
      bySuburb: {},
      byBusinessType: {},
      completionPercent: 0,
      discovered: 0,
      duplicatesSkipped: 0,
      pendingQa: 0,
      qaApproved: 0,
      claimable: 0,
      claimed: 0,
      verified: 0,
      storeDraftReady: 0,
      providerUsed: null,
      suburbsSearched: [],
      categoriesSearched: [],
      fetchLimit: resolvedTarget,
      errors: [],
      candidatesWithMedia: 0,
      candidatesWithBusinessSpecificMedia: 0,
      candidatesUsingRepresentativeMedia: 0,
      briefsGenerated: 0,
      briefsDownloaded: 0,
      claimIntentsStarted: 0,
      claimIntentsFromBiDownload: 0,
      claimConversionRate: 0,
    };
  }

  const byStatus = countByStatus(candidates);
  const campaignId = candidates.find((c) => c.campaignId)?.campaignId ?? batchId;

  const bySuburb: Record<string, number> = {};
  const byBusinessType: Record<string, number> = {};
  let missingMenus = 0;
  let missingLogos = 0;

  for (const c of candidates) {
    const suburb = c.suburb ?? c.city ?? 'unknown';
    bySuburb[suburb] = (bySuburb[suburb] ?? 0) + 1;
    const bt = c.businessType ?? 'unknown';
    byBusinessType[bt] = (byBusinessType[bt] ?? 0) + 1;
    if (c.missingFields.includes('menu') || !c.fetchedMenu) missingMenus += 1;
    if (c.missingFields.includes('logo') || !c.fetchedImages.some((i) => i.label === 'logo')) {
      missingLogos += 1;
    }
  }

  const pendingQa = (byStatus.PENDING_QA ?? 0) + (byStatus.DISCOVERED ?? 0);
  const qaApproved = (byStatus.CLAIMABLE ?? 0) + (byStatus.CLAIM_PENDING ?? 0) + (byStatus.VERIFIED ?? 0);
  const claimable = byStatus.CLAIMABLE ?? 0;
  const claimed = byStatus.CLAIM_PENDING ?? 0;
  const verified = byStatus.VERIFIED ?? 0;
  const storeDraftReady = byStatus.STORE_DRAFT_READY ?? 0;
  const published = (byStatus.PUBLISHED ?? 0) + (byStatus.ACTIVE ?? 0);
  const active = byStatus.ACTIVE ?? 0;
  const waitingOwnerReview = byStatus.OWNER_REVIEW ?? 0;
  const discovered = candidates.length;
  const duplicatesSkipped = byStatus.DUPLICATE ?? 0;

  const seedIds = new Set(candidates.map((c) => c.seedId).filter(Boolean));
  const linkedSeeds = (await listSeedRecords()).filter(
    (s) => seedIds.has(s.id) || s.batchId === batchId,
  );
  const seedsClaimable = linkedSeeds.filter((s) => s.verificationStatus === 'seeded_claimable').length;

  const completionPercent =
    resolvedTarget > 0 ? Math.min(100, Math.round((published / resolvedTarget) * 100)) : 0;

  const providerUsed =
    candidates.find((c) => c.discoveryProviderId)?.discoveryProviderId ?? null;

  const candidateIds = new Set(candidates.map((c) => c.id));
  const allMedia = await Promise.all(candidates.map((c) => listMediaForCandidate(c.id)));
  let candidatesWithMedia = 0;
  let candidatesWithBusinessSpecificMedia = 0;
  let candidatesUsingRepresentativeMedia = 0;
  for (const assets of allMedia) {
    const usable = assets.filter((a) => a.licenseStatus !== 'prohibited' && a.usageStatus !== 'blocked');
    if (usable.length) candidatesWithMedia += 1;
    if (usable.some((a) => a.businessSpecificConfidence >= 0.6 && !a.isRepresentative)) {
      candidatesWithBusinessSpecificMedia += 1;
    }
    if (usable.some((a) => a.isRepresentative || a.sourceType === 'category_stock')) {
      candidatesUsingRepresentativeMedia += 1;
    }
  }

  const briefs = (await listBriefs()).filter((b) => candidateIds.has(b.candidateId));
  const briefsGenerated = briefs.filter((b) => b.status !== 'draft').length;
  const briefsDownloaded = briefs.filter((b) => b.downloadedAt).length;

  const intents = (await listClaimIntents()).filter(
    (i) => i.candidateId && candidateIds.has(i.candidateId),
  );
  const claimIntentsStarted = intents.length;
  const claimIntentsFromBiDownload = intents.filter((i) => i.source === 'BI_BRIEF_DOWNLOAD').length;
  const claimConversionRate =
    claimIntentsStarted > 0
      ? Math.round((briefsDownloaded / claimIntentsStarted) * 100)
      : 0;

  return {
    batchId,
    campaignId,
    targetCount: resolvedTarget,
    total: candidates.length,
    byStatus,
    pipeline: countByPipelineStage(byStatus),
    crmOverlay: countByCrmOverlay(byStatus),
    missingMenus,
    missingLogos,
    waitingOwnerReview,
    published,
    active,
    bySuburb,
    byBusinessType,
    completionPercent,
    discovered,
    duplicatesSkipped,
    pendingQa,
    qaApproved,
    claimable: Math.max(claimable, seedsClaimable),
    claimed,
    verified,
    storeDraftReady,
    providerUsed,
    suburbsSearched: Object.keys(bySuburb),
    categoriesSearched: Object.keys(byBusinessType),
    fetchLimit: resolvedTarget,
    errors: [],
    candidatesWithMedia,
    candidatesWithBusinessSpecificMedia,
    candidatesUsingRepresentativeMedia,
    briefsGenerated,
    briefsDownloaded,
    claimIntentsStarted,
    claimIntentsFromBiDownload,
    claimConversionRate,
  };
}
