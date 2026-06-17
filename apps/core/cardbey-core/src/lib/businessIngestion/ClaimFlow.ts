/**
 * Claim & verification flow (Phase 7).
 * seeded_claimable → verified_owner after ownership proof.
 */

import type { IngestedSeedRecord, SeedVerificationStatus } from './types.js';
import {
  applySeedStatusTransition,
  canTransitionSeedStatus,
} from './SeedGovernance.js';

export type ClaimVerificationMethod = 'email' | 'phone' | 'website' | 'registration';

export interface ClaimVerificationProof {
  method: ClaimVerificationMethod;
  verified: boolean;
  contact?: string | null;
}

export interface ClaimRequest {
  userId: string;
  proofs: ClaimVerificationProof[];
}

export interface ClaimResult {
  ok: boolean;
  record: IngestedSeedRecord;
  message: string;
  verificationStatus: SeedVerificationStatus;
}

function hasVerifiedProof(proofs: ClaimVerificationProof[]): boolean {
  return proofs.some((p) => p.verified);
}

/**
 * Submit an ownership claim for a seeded business.
 * Requires record to be seeded_claimable and at least one verified proof.
 */
export function submitSeedClaim(
  record: IngestedSeedRecord,
  request: ClaimRequest,
): ClaimResult {
  if (record.verificationStatus !== 'seeded_claimable') {
    return {
      ok: false,
      record,
      message: `Record is not claimable (status: ${record.verificationStatus}).`,
      verificationStatus: record.verificationStatus,
    };
  }

  if (!hasVerifiedProof(request.proofs)) {
    return {
      ok: false,
      record,
      message: 'At least one verified proof (email, phone, website, or registration) is required.',
      verificationStatus: record.verificationStatus,
    };
  }

  const transition = applySeedStatusTransition(record, 'verified_owner');
  if (!transition.ok) {
    return {
      ok: false,
      record,
      message: transition.message,
      verificationStatus: record.verificationStatus,
    };
  }

  return {
    ok: true,
    record: {
      ...transition.record,
      ownerUserId: request.userId,
    },
    message: 'Ownership verified. Profile may be completed by the owner.',
    verificationStatus: 'verified_owner',
  };
}

/**
 * Activate a verified owner profile after completion.
 */
export function activateVerifiedSeed(record: IngestedSeedRecord): ClaimResult {
  if (!canTransitionSeedStatus(record.verificationStatus, 'active')) {
    return {
      ok: false,
      record,
      message: `Cannot activate from status ${record.verificationStatus}.`,
      verificationStatus: record.verificationStatus,
    };
  }
  const transition = applySeedStatusTransition(record, 'active');
  return {
    ok: transition.ok,
    record: transition.record,
    message: transition.ok ? 'Seed store is now active.' : transition.message,
    verificationStatus: transition.record.verificationStatus,
  };
}
