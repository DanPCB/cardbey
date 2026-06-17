/**
 * QA quality gates (V1.1).
 * Auto-suggest approval only — never auto-publish to active or claimable.
 */

import type { IngestedSeedRecord } from './types.js';

export const AUTO_APPROVAL_MIN_QUALITY_SCORE = 70;

export interface AutoApprovalSuggestion {
  suggested: boolean;
  reasons: string[];
}

/**
 * Returns whether an admin *may* be suggested to approve this seed.
 * Does NOT perform promotion — human confirmation required.
 */
export function suggestAutoApproval(seed: IngestedSeedRecord): AutoApprovalSuggestion {
  const reasons: string[] = [];
  const n = seed.normalized;

  if (seed.verificationStatus !== 'seeded_pending_qa') {
    reasons.push(`status is ${seed.verificationStatus}, not seeded_pending_qa`);
  }
  if (seed.qualityScore < AUTO_APPROVAL_MIN_QUALITY_SCORE) {
    reasons.push(`qualityScore ${seed.qualityScore} < ${AUTO_APPROVAL_MIN_QUALITY_SCORE}`);
  }
  if (seed.resolution !== 'unique') {
    reasons.push(`duplicateStatus is ${seed.resolution}, not unique`);
  }
  if (!n.businessName?.trim()) {
    reasons.push('businessName missing');
  }
  if (!n.address?.trim() && !n.website?.trim()) {
    reasons.push('address and website both missing');
  }
  if (seed.verificationStatus === 'duplicate' || seed.verificationStatus === 'rejected') {
    reasons.push(`terminal QA status: ${seed.verificationStatus}`);
  }

  return {
    suggested: reasons.length === 0,
    reasons,
  };
}

/** Hard block: entity/marked duplicates cannot be promoted to claimable. */
export function canPromoteToClaimable(seed: IngestedSeedRecord): { ok: boolean; message: string } {
  if (seed.verificationStatus === 'duplicate' || seed.resolution === 'duplicate') {
    return { ok: false, message: 'Duplicate seeds cannot be promoted to claimable.' };
  }
  if (seed.verificationStatus === 'rejected') {
    return { ok: false, message: 'Rejected seeds cannot be promoted. Send back to review first.' };
  }
  if (seed.verificationStatus !== 'seeded_pending_qa') {
    return {
      ok: false,
      message: `Only seeded_pending_qa seeds can be approved (current: ${seed.verificationStatus}).`,
    };
  }
  return { ok: true, message: 'OK' };
}
