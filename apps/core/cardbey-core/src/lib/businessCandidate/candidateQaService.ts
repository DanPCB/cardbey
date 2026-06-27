/**
 * QA bridge for BusinessCandidate — approve creates governed BusinessSeed (claimable).
 * Never creates Store or DraftStore.
 */

import type { BusinessCandidateRecord } from './types.js';
import {
  getBusinessCandidateById,
  listBusinessCandidatesByBatch,
} from './candidateRepository.js';
import { transitionCandidateStatus } from './candidateLifecycle.js';
import { isPendingQaCandidate } from './candidateDedupe.js';
import { discoveryPromotionPipeline } from '../discoveryEngine/pipelines/DiscoveryPromotionPipeline.js';
import { approveSeed } from '../businessIngestion/QaPromotionService.js';
import type { BusinessCandidate as DiscoveryBusinessCandidate } from '../discoveryEngine/types/index.js';

function toDiscoveryShape(record: BusinessCandidateRecord): DiscoveryBusinessCandidate {
  return {
    providerId: record.discoveryProviderId as DiscoveryBusinessCandidate['providerId'],
    externalId: record.externalId,
    businessName: record.name,
    category: record.businessType,
    address: record.address,
    city: record.suburb ?? record.city,
    state: record.state,
    postcode: record.postcode,
    country: record.country,
    latitude: record.coordinates?.lat ?? null,
    longitude: record.coordinates?.lng ?? null,
    phone: record.phone,
    email: record.email,
    website: record.website,
    socialProfiles: record.socialLinks.map((s) => ({ platform: s.platform, url: s.url })),
    sourceUrl: record.sourceUrl,
    discoveredAt: record.createdAt,
    confidence: record.confidenceScore,
    metadata: {
      candidateId: record.id,
      placeId: record.placeId,
      suburb: record.suburb,
      rawSourceJson: record.rawSourceJson,
    },
  };
}

export async function listCandidatesPendingQa(
  batchId?: string | null,
): Promise<BusinessCandidateRecord[]> {
  const all = batchId
    ? await listBusinessCandidatesByBatch(batchId)
    : await import('./candidateRepository.js').then((m) => m.listBusinessCandidates());
  return all.filter(isPendingQaCandidate);
}

export async function approveCandidateForClaiming(params: {
  candidateId: string;
  reviewerId: string;
  reason?: string | null;
}): Promise<{ ok: boolean; candidate?: BusinessCandidateRecord; seedId?: string; message: string }> {
  const candidate = await getBusinessCandidateById(params.candidateId);
  if (!candidate) {
    return { ok: false, message: 'Candidate not found' };
  }
  if (!isPendingQaCandidate(candidate)) {
    return { ok: false, message: `Candidate is ${candidate.status}, not pending QA` };
  }
  if (candidate.seedId) {
    return { ok: false, message: 'Candidate already linked to a seed' };
  }

  const promotion = await discoveryPromotionPipeline.promote([toDiscoveryShape(candidate)], {
    batchId: candidate.batchId,
    campaignId: candidate.campaignId,
  });

  if (!promotion.seeds.length) {
    await transitionCandidateStatus({
      candidate,
      toStatus: 'DUPLICATE',
      action: 'qa_reject_duplicate',
      actorId: params.reviewerId,
      actorType: 'admin',
      metadata: { reason: 'Promotion rejected as duplicate' },
    });
    return { ok: false, message: 'Duplicate — could not create claimable seed' };
  }

  const seed = promotion.seeds[0]!;
  const approved = await approveSeed(seed.id, params.reason ?? 'QA approved real local pilot candidate');

  if (!approved.ok) {
    return { ok: false, message: approved.message ?? 'Seed QA approval failed' };
  }

  const updated = await transitionCandidateStatus({
    candidate,
    toStatus: 'CLAIMABLE',
    action: 'qa_approve',
    actorId: params.reviewerId,
    actorType: 'admin',
    patch: { seedId: seed.id },
    metadata: { seedId: seed.id, reviewerReason: params.reason ?? null },
  });

  return {
    ok: true,
    candidate: updated,
    seedId: seed.id,
    message: 'Candidate approved — now claimable in Claims Review',
  };
}

export async function rejectCandidateQa(params: {
  candidateId: string;
  reviewerId: string;
  reason?: string | null;
}): Promise<{ ok: boolean; candidate?: BusinessCandidateRecord; message: string }> {
  const candidate = await getBusinessCandidateById(params.candidateId);
  if (!candidate) {
    return { ok: false, message: 'Candidate not found' };
  }
  if (!isPendingQaCandidate(candidate)) {
    return { ok: false, message: `Candidate is ${candidate.status}, not pending QA` };
  }

  const updated = await transitionCandidateStatus({
    candidate,
    toStatus: 'QA_REJECTED',
    action: 'qa_reject',
    actorId: params.reviewerId,
    actorType: 'admin',
    metadata: { reason: params.reason ?? null },
  });

  return { ok: true, candidate: updated, message: 'Candidate rejected' };
}
