/**
 * Claim status state machine.
 *
 * Hard rules enforced here:
 * - External/discovered data is created as `unclaimed`. NEVER owner-confirmed.
 * - A user requesting ownership moves a record to `pending_verification`.
 * - Only an explicit, verified claim moves it to `claimed`.
 * - Editing as the official owner is only allowed once `claimed`.
 */

import type { ClaimStatus } from './businessDiscoveryTypes.js';

export const CLAIM_STATUSES: ClaimStatus[] = [
  'unclaimed',
  'pending_verification',
  'claimed',
];

const ALLOWED_TRANSITIONS: Record<ClaimStatus, ClaimStatus[]> = {
  unclaimed: ['pending_verification', 'claimed'],
  pending_verification: ['claimed', 'unclaimed'],
  claimed: [], // terminal in Phase 1 (no un-claiming via this layer)
};

export function isValidClaimStatus(value: unknown): value is ClaimStatus {
  return typeof value === 'string' && (CLAIM_STATUSES as string[]).includes(value);
}

export function canTransition(from: ClaimStatus, to: ClaimStatus): boolean {
  if (from === to) return true;
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

/**
 * Whether the given user may edit the record AS THE OFFICIAL OWNER.
 * Returns false for unclaimed/pending — those are external, unverified records.
 */
export function canEditAsOwner(record: {
  claimStatus: ClaimStatus;
  claimedByUserId: string | null;
}, userId: string | null | undefined): boolean {
  return Boolean(
    record.claimStatus === 'claimed' && userId && record.claimedByUserId === userId,
  );
}

export interface ClaimResult {
  ok: boolean;
  status: ClaimStatus;
  message: string;
}

/**
 * Compute the result of a claim request. Phase 1 keeps verification as a
 * placeholder: with no verification proof, a claim becomes `pending_verification`;
 * with a verified proof token it becomes `claimed`.
 */
export function evaluateClaim(params: {
  current: ClaimStatus;
  verified: boolean;
}): ClaimResult {
  const { current, verified } = params;
  const target: ClaimStatus = verified ? 'claimed' : 'pending_verification';
  if (!canTransition(current, target)) {
    return {
      ok: false,
      status: current,
      message: `Cannot move claim from "${current}" to "${target}".`,
    };
  }
  return {
    ok: true,
    status: target,
    message: verified
      ? 'Business claimed and verified.'
      : 'Claim submitted. Pending ownership verification.',
  };
}
