/**
 * Governed seed lifecycle — stage mapping, transition rules, audit contract.
 * Discovery/QA never create stores; activation only via runtime runway.
 */

import type {
  GovernedSeedLifecycleStage,
  IngestedSeedRecord,
  SeedLifecycleAction,
  SeedVerificationStatus,
} from './types.js';

/** Internal verification status → governed lifecycle stage (Discovery Center). */
export function toGovernedLifecycleStage(
  status: SeedVerificationStatus,
): GovernedSeedLifecycleStage {
  switch (status) {
    case 'seeded_pending_qa':
      return 'seeded_pending_qa';
    case 'seeded_claimable':
      return 'qa_approved';
    case 'claim_pending':
      return 'claim_pending';
    case 'verified_owner':
      return 'activation_ready';
    case 'active':
      return 'activated_store';
    case 'rejected':
      return 'qa_rejected';
    case 'duplicate':
      return 'duplicate';
    default:
      return 'seeded_pending_qa';
  }
}

/** Post-claim-verify stage label (audit metadata). */
export function claimedLifecycleStage(): GovernedSeedLifecycleStage {
  return 'claimed';
}

export function lifecycleStageLabel(stage: GovernedSeedLifecycleStage): string {
  const labels: Record<GovernedSeedLifecycleStage, string> = {
    seeded_pending_qa: 'Pending QA',
    qa_approved: 'QA Approved',
    qa_rejected: 'QA Rejected',
    claim_pending: 'Claim Pending',
    claimed: 'Claimed',
    activation_ready: 'Activation Ready',
    activated_store: 'Activated Store',
    duplicate: 'Duplicate',
  };
  return labels[stage] ?? stage;
}

export function buildSeedLifecycleFunnel(
  byStatus: Record<string, number>,
): Record<GovernedSeedLifecycleStage, number> {
  return {
    seeded_pending_qa: byStatus.seeded_pending_qa ?? 0,
    qa_approved: byStatus.seeded_claimable ?? 0,
    qa_rejected: byStatus.rejected ?? 0,
    claim_pending: byStatus.claim_pending ?? 0,
    claimed: 0,
    activation_ready: byStatus.verified_owner ?? 0,
    activated_store: byStatus.active ?? 0,
    duplicate: byStatus.duplicate ?? 0,
  };
}

/** Runtime authority — paths that must never create Business/DraftStore rows. */
export const GOVERNED_NON_STORE_ACTIONS = new Set<SeedLifecycleAction>([
  'discovery_ingested',
  'qa_approve',
  'qa_reject',
  'qa_mark_duplicate',
  'qa_merge',
  'qa_send_back',
  'claim_start',
  'claim_verify',
  'claim_reject',
  'claim_expire',
]);

export function assertNonStoreLifecycleAction(action: SeedLifecycleAction): void {
  if (!GOVERNED_NON_STORE_ACTIONS.has(action) && action !== 'activation_blocked_duplicate') {
    return;
  }
}

export function assertSeedHasNoStoreBeforeActivation(seed: IngestedSeedRecord): void {
  if (seed.verificationStatus !== 'active' && seed.verificationStatus !== 'verified_owner') {
    if (seed.storeId != null) {
      throw new Error(
        `Governance violation: seed ${seed.id} has storeId before activation (status=${seed.verificationStatus})`,
      );
    }
  }
}

export function qaActionToLifecycleAction(
  action: import('./types.js').QaPromotionAction,
): SeedLifecycleAction {
  switch (action) {
    case 'approve':
      return 'qa_approve';
    case 'reject':
      return 'qa_reject';
    case 'mark_duplicate':
      return 'qa_mark_duplicate';
    case 'merge':
      return 'qa_merge';
    case 'send_back_to_review':
      return 'qa_send_back';
    default:
      return 'qa_approve';
  }
}

export function mapQaActionToGovernedStage(
  action: import('./types.js').QaPromotionAction,
  nextStatus: SeedVerificationStatus,
): GovernedSeedLifecycleStage {
  if (action === 'approve') return 'qa_approved';
  if (action === 'reject') return 'qa_rejected';
  return toGovernedLifecycleStage(nextStatus);
}
