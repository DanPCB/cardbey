/**
 * QA quality gates (V1.1).
 * Auto-suggest approval only — never auto-publish to active or claimable.
 */

import type { IngestedSeedRecord } from './types.js';
import { parseCompletenessList } from '../ingestion/persistSeedCompleteness.js';

export const AUTO_APPROVAL_MIN_QUALITY_SCORE = 70;

/** Prestige / outreach seeds missing a real hero must not bulk-approve. */
export const QA_FLAG_HERO_MISSING = 'HERO_MISSING';

/** Completeness codes that block QA approve → seeded_claimable (not ITEMS_* — those wait on extraction). */
export const APPROVE_COMPLETENESS_BLOCKERS = Object.freeze([
  'HERO_MISSING',
  'HERO_LOW_RES',
  'HERO_LOGO_SUSPECT',
  'NAME_MISSING',
  'CATEGORY_MISSING',
  'ADDRESS_OR_HOURS_MISSING',
]);

export interface AutoApprovalSuggestion {
  suggested: boolean;
  reasons: string[];
}

function seedQaFlags(seed: IngestedSeedRecord): string[] {
  return Array.isArray(seed.qaFlags) ? seed.qaFlags.map(String) : [];
}

/**
 * Returns whether an admin *may* be suggested to approve this seed.
 * Does NOT perform promotion — human confirmation required.
 */
export function suggestAutoApproval(seed: IngestedSeedRecord): AutoApprovalSuggestion {
  const reasons: string[] = [];
  const n = seed.normalized;

  if (seedQaFlags(seed).includes(QA_FLAG_HERO_MISSING)) {
    reasons.push('HERO_MISSING — assign a venue hero before QA approve / outreach');
  }
  for (const code of completenessApproveBlockers(seed)) {
    if (code !== QA_FLAG_HERO_MISSING) {
      reasons.push(`${code} — completeness blocker`);
    }
  }
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

function completenessApproveBlockers(seed: IngestedSeedRecord): string[] {
  const fromFlags = seedQaFlags(seed).includes(QA_FLAG_HERO_MISSING) ? [QA_FLAG_HERO_MISSING] : [];
  const fromCompleteness = parseCompletenessList(seed.completenessBlockers).filter((code) =>
    APPROVE_COMPLETENESS_BLOCKERS.includes(code),
  );
  return [...new Set([...fromFlags, ...fromCompleteness])];
}

/** Hard block: entity/marked duplicates cannot be promoted to claimable. */
export function canPromoteToClaimable(seed: IngestedSeedRecord): {
  ok: boolean;
  message: string;
  blockers?: string[];
} {
  const blockers = completenessApproveBlockers(seed);
  if (blockers.length > 0) {
    return {
      ok: false,
      message: `${blockers.join(', ')} — completeness blockers must be cleared before QA approve.`,
      blockers,
    };
  }
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
