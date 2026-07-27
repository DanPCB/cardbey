/**
 * Governed BusinessCandidate lifecycle — single canonical state machine.
 */

import type { BusinessCandidateRecord, BusinessCandidateStatus } from './types.js';
import {
  appendCandidateTransition,
  saveBusinessCandidate,
} from './candidateRepository.js';
import { emitCandidateStatusChanged } from './candidateRuntimeEvents.js';

const ALLOWED: Record<BusinessCandidateStatus, BusinessCandidateStatus[]> = {
  DISCOVERED: ['FETCHING', 'READY_FOR_REVIEW', 'PENDING_QA', 'QA_REJECTED', 'DUPLICATE'],
  PENDING_QA: ['CLAIMABLE', 'QA_REJECTED', 'DUPLICATE'],
  FETCHING: ['READY_FOR_REVIEW', 'OWNER_CONTACTED', 'PENDING_QA'],
  READY_FOR_REVIEW: ['OWNER_CONTACTED', 'STORE_DRAFT_READY', 'PENDING_QA'],
  OWNER_CONTACTED: ['READY_FOR_REVIEW', 'STORE_DRAFT_READY'],
  STORE_DRAFT_READY: ['OWNER_REVIEW'],
  OWNER_REVIEW: ['STORE_DRAFT_READY', 'PUBLISHED'],
  PUBLISHED: ['ACTIVE'],
  ACTIVE: [],
  QA_REJECTED: [],
  CLAIMABLE: ['CLAIM_PENDING'],
  CLAIM_PENDING: ['VERIFIED', 'CLAIMABLE'],
  VERIFIED: ['STORE_DRAFT_READY', 'PUBLISHED'],
  DUPLICATE: [],
};

export function canTransitionCandidateStatus(
  from: BusinessCandidateStatus,
  to: BusinessCandidateStatus,
): boolean {
  if (from === to) return true;
  return (ALLOWED[from] ?? []).includes(to);
}

export async function transitionCandidateStatus(params: {
  candidate: BusinessCandidateRecord;
  toStatus: BusinessCandidateStatus;
  action: string;
  actorId?: string;
  actorType?: 'admin' | 'user' | 'system' | 'performer';
  metadata?: Record<string, unknown>;
  patch?: Partial<BusinessCandidateRecord>;
}): Promise<BusinessCandidateRecord> {
  const { candidate, toStatus, action } = params;
  if (!canTransitionCandidateStatus(candidate.status, toStatus)) {
    throw new Error(`Invalid candidate transition: ${candidate.status} → ${toStatus}`);
  }

  const fromStatus = candidate.status;
  const now = new Date().toISOString();
  const updated: BusinessCandidateRecord = {
    ...candidate,
    ...params.patch,
    status: toStatus,
    updatedAt: now,
  };

  await saveBusinessCandidate(updated);
  await appendCandidateTransition({
    candidateId: candidate.id,
    fromStatus,
    toStatus,
    action,
    actorId: params.actorId ?? 'system',
    actorType: params.actorType ?? 'system',
    metadata: params.metadata ?? {},
  });

  emitCandidateStatusChanged(updated, fromStatus, action, params.actorId);
  return updated;
}

export async function attachStoreDraftToCandidate(
  candidate: BusinessCandidateRecord,
  storeDraftId: string,
  actorId?: string,
): Promise<BusinessCandidateRecord> {
  return transitionCandidateStatus({
    candidate,
    toStatus: 'STORE_DRAFT_READY',
    action: 'store_draft_created',
    actorId,
    actorType: 'performer',
    patch: { storeDraftId },
    metadata: { storeDraftId },
  });
}

export async function attachMissionToCandidate(
  candidate: BusinessCandidateRecord,
  missionId: string,
): Promise<BusinessCandidateRecord> {
  const updated: BusinessCandidateRecord = {
    ...candidate,
    missionId,
    updatedAt: new Date().toISOString(),
  };
  return saveBusinessCandidate(updated);
}
