/**
 * CRM overlay — derived from BusinessCandidate runtime status only.
 * Never persist CRM stages independently.
 */

import type {
  BusinessCandidateStatus,
  CrmOverlayStage,
  OnboardingPipelineStage,
} from './types.js';

const STATUS_TO_PIPELINE: Record<BusinessCandidateStatus, OnboardingPipelineStage> = {
  DISCOVERED: 'discovery',
  PENDING_QA: 'discovery',
  QA_REJECTED: 'discovery',
  DUPLICATE: 'discovery',
  FETCHING: 'reasoning',
  READY_FOR_REVIEW: 'reasoning',
  OWNER_CONTACTED: 'reasoning',
  CLAIMABLE: 'owner_review',
  CLAIM_PENDING: 'owner_review',
  VERIFIED: 'owner_review',
  STORE_DRAFT_READY: 'store_draft',
  OWNER_REVIEW: 'owner_review',
  PUBLISHED: 'published',
  ACTIVE: 'growing',
};

const STATUS_TO_CRM: Record<BusinessCandidateStatus, CrmOverlayStage> = {
  DISCOVERED: 'discovery',
  PENDING_QA: 'discovery',
  QA_REJECTED: 'discovery',
  DUPLICATE: 'discovery',
  FETCHING: 'discovery',
  READY_FOR_REVIEW: 'conversation_started',
  OWNER_CONTACTED: 'contacted',
  CLAIMABLE: 'store_draft_ready',
  CLAIM_PENDING: 'owner_reviewing',
  VERIFIED: 'owner_reviewing',
  STORE_DRAFT_READY: 'store_draft_ready',
  OWNER_REVIEW: 'owner_reviewing',
  PUBLISHED: 'published',
  ACTIVE: 'activated',
};

export function pipelineStageFromStatus(status: BusinessCandidateStatus): OnboardingPipelineStage {
  return STATUS_TO_PIPELINE[status];
}

export function crmStageFromStatus(status: BusinessCandidateStatus): CrmOverlayStage {
  return STATUS_TO_CRM[status];
}

export function countByPipelineStage(
  byStatus: Partial<Record<BusinessCandidateStatus, number>>,
): Record<OnboardingPipelineStage, number> {
  const out: Record<OnboardingPipelineStage, number> = {
    discovery: 0,
    reasoning: 0,
    store_draft: 0,
    owner_review: 0,
    published: 0,
    activated: 0,
    growing: 0,
  };
  for (const [status, count] of Object.entries(byStatus) as [BusinessCandidateStatus, number][]) {
    if (!count) continue;
    out[pipelineStageFromStatus(status)] += count;
  }
  return out;
}

export function countByCrmOverlay(
  byStatus: Partial<Record<BusinessCandidateStatus, number>>,
): Record<CrmOverlayStage, number> {
  const out: Record<CrmOverlayStage, number> = {
    discovery: 0,
    contacted: 0,
    conversation_started: 0,
    store_draft_ready: 0,
    owner_reviewing: 0,
    published: 0,
    activated: 0,
  };
  for (const [status, count] of Object.entries(byStatus) as [BusinessCandidateStatus, number][]) {
    if (!count) continue;
    out[crmStageFromStatus(status)] += count;
  }
  return out;
}
