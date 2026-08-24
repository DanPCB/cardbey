/**
 * QA Promotion Service (V1.1).
 * Admin-controlled promotion for ingestion seeds.
 */

import type {
  IngestedSeedRecord,
  QaQueueFilters,
  QaQueueItem,
  SeedVerificationStatus,
} from './types.js';
import { appendQaAuditEntry } from './QaAuditLog.js';
import { recordSeedLifecycleTransition } from './BusinessSeedStatusTransitionRepository.js';
import {
  assertSeedHasNoStoreBeforeActivation,
  mapQaActionToGovernedStage,
  qaActionToLifecycleAction,
} from './seedLifecycleGovernance.js';
import { canPromoteToClaimable, suggestAutoApproval } from './QaQualityGates.js';
import {
  getSeedRecordById,
  listSeedRecords,
  upsertSeedRecords,
} from './IngestionRepository.js';
import { scheduleBusinessEnrichmentForSeed } from './BusinessEnrichmentAgent.js';

const CLAIMABLE_STATUSES: SeedVerificationStatus[] = ['seeded_claimable'];

export function isClaimableSeed(seed: IngestedSeedRecord): boolean {
  return (
    CLAIMABLE_STATUSES.includes(seed.verificationStatus) &&
    seed.claimable === true &&
    !seed.storeId &&
    seed.verificationStatus !== 'rejected' &&
    seed.verificationStatus !== 'duplicate'
  );
}

export function applyQaFilters(seeds: IngestedSeedRecord[], filters: QaQueueFilters): IngestedSeedRecord[] {
  return seeds.filter((s) => {
    if (filters.status && s.verificationStatus !== filters.status) return false;
    if (filters.minQualityScore != null && s.qualityScore < filters.minQualityScore) return false;
    if (filters.maxQualityScore != null && s.qualityScore > filters.maxQualityScore) return false;
    if (filters.sourceType && s.normalized.sourceType !== filters.sourceType) return false;
    if (filters.duplicateStatus && s.resolution !== filters.duplicateStatus) return false;
    if (filters.category) {
      const cat = (s.normalized.category ?? '').toLowerCase();
      if (!cat.includes(filters.category.toLowerCase())) return false;
    }
    if (filters.city) {
      const city = (s.normalized.city ?? '').toLowerCase();
      if (!city.includes(filters.city.toLowerCase())) return false;
    }
    if (filters.autoApprovalSuggested != null) {
      const { suggested } = suggestAutoApproval(s);
      if (suggested !== filters.autoApprovalSuggested) return false;
    }
    return true;
  });
}

export function enrichQueueItem(seed: IngestedSeedRecord): QaQueueItem {
  const { suggested, reasons } = suggestAutoApproval(seed);
  return {
    ...seed,
    autoApprovalSuggested: suggested,
    autoApprovalReasons: reasons,
  };
}

export async function listQaQueue(filters: QaQueueFilters = {}): Promise<QaQueueItem[]> {
  const status = filters.status ?? 'seeded_pending_qa';
  const seeds = await listSeedRecords();
  const filtered = applyQaFilters(seeds, { ...filters, status });
  return filtered.map(enrichQueueItem);
}

export async function listClaimableSeeds(): Promise<IngestedSeedRecord[]> {
  const seeds = await listSeedRecords();
  return seeds.filter(isClaimableSeed);
}

function patchSeed(
  seed: IngestedSeedRecord,
  patch: Partial<IngestedSeedRecord> & { verificationStatus: SeedVerificationStatus },
): IngestedSeedRecord {
  const claimable = patch.verificationStatus === 'seeded_claimable';
  return {
    ...seed,
    ...patch,
    claimable,
    updatedAt: new Date().toISOString(),
  };
}

async function persistWithAudit(
  seed: IngestedSeedRecord,
  updated: IngestedSeedRecord,
  action: import('./types.js').QaPromotionAction,
  reviewerId: string,
  reason: string | null,
  canonicalSeedId?: string | null,
): Promise<{ ok: boolean; seed: IngestedSeedRecord; message: string }> {
  assertSeedHasNoStoreBeforeActivation(updated);
  await upsertSeedRecords([updated]);
  await appendQaAuditEntry({
    seedId: seed.id,
    previousStatus: seed.verificationStatus,
    nextStatus: updated.verificationStatus,
    action,
    reviewerId,
    reason,
    canonicalSeedId,
  });
  await recordSeedLifecycleTransition({
    seedId: seed.id,
    fromStatus: seed.verificationStatus,
    toStatus: updated.verificationStatus,
    lifecycleStage: mapQaActionToGovernedStage(action, updated.verificationStatus),
    action: qaActionToLifecycleAction(action),
    actorId: reviewerId,
    actorType: 'admin',
    reason,
    metadata: canonicalSeedId ? { canonicalSeedId } : undefined,
  });

  if (action === 'approve') {
    const businessName = updated.normalized?.businessName ?? 'A business';
    const region = updated.normalized?.country ?? updated.normalized?.city ?? null;
    void import('../platformActivity/platformActivityEmitter.js')
      .then(({ emitPlatformActivity }) =>
        emitPlatformActivity({
          type: 'business_seed_qa_approved',
          severity: 'success',
          actorType: 'admin',
          actorId: reviewerId,
          entityType: 'business_seed',
          entityId: seed.id,
          title: 'Business seed QA approved',
          message: `${businessName} is now claimable.`,
          route: '/admin/discovery?view=qa',
          region,
        }),
      )
      .catch(() => {});
  }

  return { ok: true, seed: updated, message: `Seed ${action} completed.` };
}

export async function approveSeed(
  seedId: string,
  reviewerId: string,
  reason?: string | null,
): Promise<{ ok: boolean; seed: IngestedSeedRecord | null; message: string }> {
  const seed = await getSeedRecordById(seedId);
  if (!seed) return { ok: false, seed: null, message: 'Seed not found.' };

  const gate = canPromoteToClaimable(seed);
  if (!gate.ok) return { ok: false, seed, message: gate.message };

  const nowIso = new Date().toISOString();
  const updated = patchSeed(seed, {
    verificationStatus: 'seeded_claimable',
    firstSeenAt: seed.firstSeenAt ?? nowIso,
  });
  const result = await persistWithAudit(seed, updated, 'approve', reviewerId, reason ?? null);
  if (result.ok && result.seed) {
    try {
      scheduleBusinessEnrichmentForSeed(result.seed);
    } catch {
      // Best-effort only — never blocks QA approve.
    }
    try {
      const { generateAndStoreBiSnapshotForSeed } = await import('./seedSuitcaseService.js');
      await generateAndStoreBiSnapshotForSeed(result.seed);
    } catch {
      // BI snapshot is best-effort — never blocks QA approve.
    }
  }
  return result;
}

export async function rejectSeed(
  seedId: string,
  reviewerId: string,
  reason?: string | null,
): Promise<{ ok: boolean; seed: IngestedSeedRecord | null; message: string }> {
  const seed = await getSeedRecordById(seedId);
  if (!seed) return { ok: false, seed: null, message: 'Seed not found.' };
  if (seed.verificationStatus !== 'seeded_pending_qa' && seed.verificationStatus !== 'seeded_claimable') {
    return {
      ok: false,
      seed,
      message: `Cannot reject seed in status ${seed.verificationStatus}.`,
    };
  }

  const updated = patchSeed(seed, {
    verificationStatus: 'rejected',
    claimable: false,
  });
  return persistWithAudit(seed, updated, 'reject', reviewerId, reason ?? null);
}

export async function markSeedDuplicate(
  seedId: string,
  reviewerId: string,
  canonicalSeedId: string,
  reason?: string | null,
): Promise<{ ok: boolean; seed: IngestedSeedRecord | null; message: string }> {
  const seed = await getSeedRecordById(seedId);
  if (!seed) return { ok: false, seed: null, message: 'Seed not found.' };
  if (seedId === canonicalSeedId) {
    return { ok: false, seed, message: 'Cannot mark a seed duplicate of itself.' };
  }
  const canonical = await getSeedRecordById(canonicalSeedId);
  if (!canonical) return { ok: false, seed, message: 'Canonical seed not found.' };

  const updated = patchSeed(seed, {
    verificationStatus: 'duplicate',
    resolution: 'duplicate',
    canonicalSeedId,
    claimable: false,
  });
  return persistWithAudit(
    seed,
    updated,
    'mark_duplicate',
    reviewerId,
    reason ?? null,
    canonicalSeedId,
  );
}

/** Merge duplicate facts into canonical; mark source as duplicate. */
export async function mergeSeedIntoCanonical(
  seedId: string,
  canonicalSeedId: string,
  reviewerId: string,
  reason?: string | null,
): Promise<{
  ok: boolean;
  seed: IngestedSeedRecord | null;
  canonical: IngestedSeedRecord | null;
  message: string;
}> {
  const seed = await getSeedRecordById(seedId);
  if (!seed) return { ok: false, seed: null, canonical: null, message: 'Seed not found.' };
  if (seedId === canonicalSeedId) {
    return { ok: false, seed, canonical: null, message: 'Cannot merge seed into itself.' };
  }
  const canonical = await getSeedRecordById(canonicalSeedId);
  if (!canonical) return { ok: false, seed, canonical: null, message: 'Canonical seed not found.' };

  const mergedCanonical: IngestedSeedRecord = {
    ...canonical,
    normalized: {
      ...canonical.normalized,
      legalName: canonical.normalized.legalName ?? seed.normalized.legalName,
      address: canonical.normalized.address ?? seed.normalized.address,
      phone: canonical.normalized.phone ?? seed.normalized.phone,
      website: canonical.normalized.website ?? seed.normalized.website,
      email: canonical.normalized.email ?? seed.normalized.email,
      category: canonical.normalized.category ?? seed.normalized.category,
      registrationNumber:
        canonical.normalized.registrationNumber ?? seed.normalized.registrationNumber,
    },
    matchEvidence: [...canonical.matchEvidence, ...seed.matchEvidence],
    qualityScore: Math.max(canonical.qualityScore, seed.qualityScore),
    updatedAt: new Date().toISOString(),
  };

  const mergedAway = patchSeed(seed, {
    verificationStatus: 'duplicate',
    resolution: 'duplicate',
    canonicalSeedId,
    claimable: false,
  });

  await upsertSeedRecords([mergedCanonical, mergedAway]);
  await appendQaAuditEntry({
    seedId: seed.id,
    previousStatus: seed.verificationStatus,
    nextStatus: 'duplicate',
    action: 'merge',
    reviewerId,
    reason: reason ?? null,
    canonicalSeedId,
  });

  return {
    ok: true,
    seed: mergedAway,
    canonical: mergedCanonical,
    message: 'Seed merged into canonical record.',
  };
}

export async function sendSeedBackToReview(
  seedId: string,
  reviewerId: string,
  reason?: string | null,
): Promise<{ ok: boolean; seed: IngestedSeedRecord | null; message: string }> {
  const seed = await getSeedRecordById(seedId);
  if (!seed) return { ok: false, seed: null, message: 'Seed not found.' };
  const allowedFrom: SeedVerificationStatus[] = ['rejected', 'seeded_claimable', 'duplicate'];
  if (!allowedFrom.includes(seed.verificationStatus)) {
    return {
      ok: false,
      seed,
      message: `Cannot send back to review from ${seed.verificationStatus}.`,
    };
  }

  const updated = patchSeed(seed, {
    verificationStatus: 'seeded_pending_qa',
    claimable: false,
    canonicalSeedId: null,
    resolution: seed.resolution === 'duplicate' ? 'possible_duplicate' : seed.resolution,
  });
  return persistWithAudit(seed, updated, 'send_back_to_review', reviewerId, reason ?? null);
}
