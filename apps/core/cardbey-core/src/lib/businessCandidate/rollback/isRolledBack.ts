/**
 * Rollback entity helpers — detect rolled-back discovery records.
 */

import type { BusinessCandidateRecord, BusinessCandidateStatus } from '../types.js';
import type { IngestedSeedRecord, SeedVerificationStatus } from '../../businessIngestion/types.js';

export const ROLLED_BACK_CANDIDATE_STATUSES: BusinessCandidateStatus[] = [
  'ROLLED_BACK',
  'HIDDEN_BY_OPERATOR',
];

export const ROLLED_BACK_SEED_STATUSES: SeedVerificationStatus[] = [
  'rolled_back',
  'hidden_by_operator',
];

export function isCandidateRolledBack(candidate: BusinessCandidateRecord | null | undefined): boolean {
  if (!candidate) return false;
  return (
    ROLLED_BACK_CANDIDATE_STATUSES.includes(candidate.status) ||
    candidate.operatorVisibility === 'hidden'
  );
}

export function isSeedRolledBack(seed: IngestedSeedRecord | null | undefined): boolean {
  if (!seed) return false;
  return ROLLED_BACK_SEED_STATUSES.includes(seed.verificationStatus);
}

export function isSeedPubliclyHidden(seed: IngestedSeedRecord): boolean {
  return isSeedRolledBack(seed) || !seed.claimable;
}

export function isVerifiedCandidateStatus(status: BusinessCandidateStatus): boolean {
  return status === 'VERIFIED' || status === 'CLAIM_PENDING';
}

export function isVerifiedSeedStatus(status: SeedVerificationStatus): boolean {
  return status === 'verified_owner' || status === 'active' || status === 'claim_pending';
}

export function isQaApprovedCandidateStatus(status: BusinessCandidateStatus): boolean {
  return (
    status === 'CLAIMABLE' ||
    status === 'CLAIM_PENDING' ||
    status === 'VERIFIED' ||
    status === 'PUBLISHED' ||
    status === 'ACTIVE'
  );
}
