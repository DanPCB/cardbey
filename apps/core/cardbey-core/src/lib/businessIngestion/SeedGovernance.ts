/**
 * Seed governance layer (Phase 5).
 * Manages verification states and provenance fields for ingested records.
 */

import type {
  IngestedSeedRecord,
  NormalizedBusinessRecord,
  QualityTier,
  ResolutionStatus,
  SeedVerificationStatus,
} from './types.js';
import type { MatchEvidence } from './types.js';

export const SEED_VERIFICATION_STATUSES: SeedVerificationStatus[] = [
  'seeded_pending_qa',
  'seeded_claimable',
  'claim_pending',
  'verified_owner',
  'active',
  'rejected',
  'duplicate',
];

const ALLOWED_TRANSITIONS: Record<SeedVerificationStatus, SeedVerificationStatus[]> = {
  seeded_pending_qa: ['seeded_claimable', 'rejected', 'duplicate'],
  seeded_claimable: ['claim_pending', 'seeded_pending_qa', 'rejected'],
  claim_pending: ['verified_owner', 'seeded_claimable'],
  verified_owner: ['active'],
  active: [],
  rejected: ['seeded_pending_qa'],
  duplicate: ['seeded_pending_qa'],
};

export function canTransitionSeedStatus(
  from: SeedVerificationStatus,
  to: SeedVerificationStatus,
): boolean {
  if (from === to) return true;
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

export function initialVerificationStatus(
  qualityTier: QualityTier,
  resolution: ResolutionStatus,
): SeedVerificationStatus {
  // Possible duplicates always require QA before claim.
  if (resolution === 'possible_duplicate') return 'seeded_pending_qa';
  if (qualityTier === 'low_quality') return 'seeded_pending_qa';
  return 'seeded_pending_qa';
}

export function buildIngestedSeedRecord(params: {
  normalized: NormalizedBusinessRecord;
  resolution: ResolutionStatus;
  matchEvidence: MatchEvidence[];
  qualityScore: number;
  qualityTier: QualityTier;
  batchId?: string | null;
  campaignId?: string | null;
}): IngestedSeedRecord {
  const now = new Date().toISOString();
  const verificationStatus = initialVerificationStatus(params.qualityTier, params.resolution);

  return {
    id: params.normalized.id,
    normalized: params.normalized,
    resolution: params.resolution,
    matchEvidence: params.matchEvidence,
    qualityScore: params.qualityScore,
    qualityTier: params.qualityTier,
    verificationStatus,
    claimable: verificationStatus === 'seeded_claimable',
    publicVisibility: 'limited',
    ownerUserId: null,
    storeId: null,
    draftId: null,
    createdAt: now,
    updatedAt: now,
    batchId: params.batchId ?? null,
    campaignId: params.campaignId ?? null,
  };
}

export function promoteSeedToClaimable(
  record: IngestedSeedRecord,
): { ok: boolean; record: IngestedSeedRecord; message: string } {
  const target: SeedVerificationStatus = 'seeded_claimable';
  if (!canTransitionSeedStatus(record.verificationStatus, target)) {
    return {
      ok: false,
      record,
      message: `Cannot promote from ${record.verificationStatus} to ${target}`,
    };
  }
  return {
    ok: true,
    record: {
      ...record,
      verificationStatus: target,
      claimable: true,
      updatedAt: new Date().toISOString(),
    },
    message: 'Seed promoted to claimable.',
  };
}

export function applySeedStatusTransition(
  record: IngestedSeedRecord,
  target: SeedVerificationStatus,
): { ok: boolean; record: IngestedSeedRecord; message: string } {
  if (!canTransitionSeedStatus(record.verificationStatus, target)) {
    return {
      ok: false,
      record,
      message: `Invalid transition: ${record.verificationStatus} → ${target}`,
    };
  }
  return {
    ok: true,
    record: {
      ...record,
      verificationStatus: target,
      claimable: target === 'seeded_claimable',
      updatedAt: new Date().toISOString(),
    },
    message: `Status updated to ${target}.`,
  };
}
