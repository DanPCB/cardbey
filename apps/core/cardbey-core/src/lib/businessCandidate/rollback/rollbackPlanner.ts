/**
 * Discovery rollback planner — dry-run scope and safety analysis.
 */

import { isProtectedBatch0 } from '../batch001Config.js';
import { listBusinessCandidatesByBatch, getBusinessCandidateById, getBusinessCandidateBySeedId } from '../candidateRepository.js';
import { listBriefs } from '../brief/briefRepository.js';
import { listClaimIntents } from '../claimIntent/claimIntentRepository.js';
import { listMediaForCandidate } from '../media/mediaEvidenceRepository.js';
import { getSeedRecordById, listSeedRecords } from '../../businessIngestion/IngestionRepository.js';
import { getPrismaClient } from '../../prisma.js';
import {
  isCandidateRolledBack,
  isQaApprovedCandidateStatus,
  isSeedRolledBack,
  isVerifiedCandidateStatus,
  isVerifiedSeedStatus,
} from './isRolledBack.js';
import { hasRollbackForcePermission, requiredPermissionsForPlan, type RollbackActor } from './rollbackPermissions.js';
import type {
  BatchRollbackInput,
  BusinessRollbackInput,
  RollbackAffectedCounts,
  RollbackAffectedRecord,
  RollbackDryRunPreview,
  RollbackPlannedAction,
  RollbackSafetyLevel,
} from './types.js';
import type { BusinessCandidateRecord } from '../types.js';
import type { IngestedSeedRecord } from '../../businessIngestion/types.js';

async function isStorePublished(storeId: string | null | undefined): Promise<boolean> {
  if (!storeId) return false;
  try {
    const prisma = getPrismaClient();
    const biz = await prisma.business.findUnique({
      where: { id: storeId },
      select: { publishedAt: true, isActive: true },
    });
    return Boolean(biz?.publishedAt && biz.isActive !== false);
  } catch {
    return false;
  }
}

function emptyCounts(): RollbackAffectedCounts {
  return {
    candidates: 0,
    seeds: 0,
    briefs: 0,
    mediaAssets: 0,
    claimIntents: 0,
    storeDrafts: 0,
    blocked: 0,
  };
}

type ScopeContext = {
  candidates: BusinessCandidateRecord[];
  seeds: IngestedSeedRecord[];
  briefs: Awaited<ReturnType<typeof listBriefs>>;
  claimIntents: Awaited<ReturnType<typeof listClaimIntents>>;
  mediaByCandidate: Map<string, Awaited<ReturnType<typeof listMediaForCandidate>>>;
};

async function buildScopeForCandidates(
  candidates: BusinessCandidateRecord[],
): Promise<ScopeContext> {
  const allSeeds = await listSeedRecords();
  const seedById = new Map(allSeeds.map((s) => [s.id, s]));
  const seeds: IngestedSeedRecord[] = [];
  const candidateIds = new Set(candidates.map((c) => c.id));

  for (const c of candidates) {
    if (c.seedId && seedById.has(c.seedId)) {
      seeds.push(seedById.get(c.seedId)!);
    }
  }

  const allBriefs = await listBriefs();
  const briefs = allBriefs.filter(
    (b) => candidateIds.has(b.candidateId) || (b.seedId && seeds.some((s) => s.id === b.seedId)),
  );

  const allIntents = await listClaimIntents();
  const claimIntents = allIntents.filter(
    (i) =>
      (i.candidateId && candidateIds.has(i.candidateId)) ||
      (i.seedId && seeds.some((s) => s.id === i.seedId)),
  );

  const mediaByCandidate = new Map<string, Awaited<ReturnType<typeof listMediaForCandidate>>>();
  for (const c of candidates) {
    mediaByCandidate.set(c.id, await listMediaForCandidate(c.id));
  }

  return { candidates, seeds, briefs, claimIntents, mediaByCandidate };
}

type PlanOptions = {
  includeQaApproved: boolean;
  includeClaimableSeeds: boolean;
  includeBriefs: boolean;
  includeMedia: boolean;
  includeClaimIntents: boolean;
  force: boolean;
  actor: RollbackActor;
};

function planForScope(
  ctx: ScopeContext,
  opts: PlanOptions,
  publishedStoreChecks: Map<string, boolean>,
): {
  actions: RollbackPlannedAction[];
  affectedRecords: RollbackAffectedRecord[];
  blockedReasons: string[];
  warnings: string[];
  counts: RollbackAffectedCounts;
  needsForce: boolean;
} {
  const actions: RollbackPlannedAction[] = [];
  const affectedRecords: RollbackAffectedRecord[] = [];
  const blockedReasons: string[] = [];
  const warnings: string[] = [];
  const counts = emptyCounts();
  let needsForce = false;
  const canForce = hasRollbackForcePermission(opts.actor);

  for (const candidate of ctx.candidates) {
    if (isCandidateRolledBack(candidate)) continue;

    const label = candidate.name ?? candidate.id;
    let blocked = false;
    let blockReason: string | undefined;

    if (isQaApprovedCandidateStatus(candidate.status) && !opts.includeQaApproved) {
      continue;
    }

    if (isVerifiedCandidateStatus(candidate.status)) {
      if (!opts.force || !canForce) {
        blocked = true;
        blockReason = `${label}: verified claim requires force permission`;
        needsForce = true;
      } else {
        warnings.push(`${label} is verified — soft rollback only (no account or store deletion)`);
      }
    }

    if (candidate.storeId && publishedStoreChecks.get(candidate.storeId)) {
      if (!opts.force || !canForce) {
        blocked = true;
        blockReason = `${label}: published store linkage blocks rollback without force`;
        needsForce = true;
      } else {
        warnings.push(`${label} has published store — store will not be deleted or unpublished`);
      }
    }

    if (candidate.ownerId && isVerifiedCandidateStatus(candidate.status)) {
      if (!opts.force || !canForce) {
        blocked = true;
        blockReason = `${label}: owner activity detected`;
        needsForce = true;
      }
    }

    actions.push({
      entityType: 'BusinessCandidate',
      entityId: candidate.id,
      action: blocked ? 'block' : 'soft_rollback',
      previousStatus: candidate.status,
      newStatus: blocked ? null : 'ROLLED_BACK',
      blocked,
      blockReason,
    });

    affectedRecords.push({
      entityType: 'BusinessCandidate',
      entityId: candidate.id,
      label,
      previousStatus: candidate.status,
      plannedStatus: blocked ? null : 'ROLLED_BACK',
      blocked,
      blockReason,
    });

    if (blocked) {
      counts.blocked += 1;
      if (blockReason) blockedReasons.push(blockReason);
    } else {
      counts.candidates += 1;
    }

    if (!blocked && candidate.storeDraftId && !candidate.ownerId) {
      actions.push({
        entityType: 'StoreDraft',
        entityId: candidate.storeDraftId,
        action: 'mark_rolled_back',
        previousStatus: null,
        newStatus: 'rolled_back',
        blocked: false,
      });
      counts.storeDrafts += 1;
    }
  }

  for (const seed of ctx.seeds) {
    if (isSeedRolledBack(seed)) continue;
    const label = seed.normalized.businessName ?? seed.id;

    if (seed.claimable && !opts.includeClaimableSeeds) continue;

    let blocked = false;
    let blockReason: string | undefined;

    if (isVerifiedSeedStatus(seed.verificationStatus)) {
      if (!opts.force || !canForce) {
        blocked = true;
        blockReason = `${label}: verified seed requires force permission`;
        needsForce = true;
      } else {
        warnings.push(`${label} seed is verified — soft hide only`);
      }
    }

    const storePublished =
      (seed.storeId && publishedStoreChecks.get(seed.storeId)) ||
      false;
    if (storePublished) {
      if (!opts.force || !canForce) {
        blocked = true;
        blockReason = `${label}: published store blocks rollback by default`;
        needsForce = true;
      } else {
        warnings.push(`${label}: published store remains live; seed will be hidden from discovery`);
      }
    }

    if (seed.ownerUserId && isVerifiedSeedStatus(seed.verificationStatus)) {
      if (!opts.force || !canForce) {
        blocked = true;
        blockReason = `${label}: owner-linked seed requires force permission`;
        needsForce = true;
      }
    }

    actions.push({
      entityType: 'BusinessSeed',
      entityId: seed.id,
      action: blocked ? 'block' : 'soft_rollback',
      previousStatus: seed.verificationStatus,
      newStatus: blocked ? null : 'rolled_back',
      blocked,
      blockReason,
    });

    affectedRecords.push({
      entityType: 'BusinessSeed',
      entityId: seed.id,
      label,
      previousStatus: seed.verificationStatus,
      plannedStatus: blocked ? null : 'rolled_back',
      blocked,
      blockReason,
    });

    if (blocked) {
      counts.blocked += 1;
      if (blockReason) blockedReasons.push(blockReason);
    } else {
      counts.seeds += 1;
    }
  }

  if (opts.includeBriefs) {
    for (const brief of ctx.briefs) {
      if (brief.status === 'rolled_back' || brief.status === 'archived') continue;
      const parentBlocked = actions.some(
        (a) =>
          a.blocked &&
          (a.entityId === brief.candidateId ||
            (brief.seedId && a.entityId === brief.seedId)),
      );
      if (parentBlocked) continue;

      actions.push({
        entityType: 'CandidateIntelligenceBrief',
        entityId: brief.id,
        action: 'archive',
        previousStatus: brief.status,
        newStatus: 'rolled_back',
        blocked: false,
      });
      affectedRecords.push({
        entityType: 'CandidateIntelligenceBrief',
        entityId: brief.id,
        label: brief.title,
        previousStatus: brief.status,
        plannedStatus: 'rolled_back',
        blocked: false,
      });
      counts.briefs += 1;
    }
  }

  if (opts.includeMedia) {
    for (const [candidateId, assets] of ctx.mediaByCandidate) {
      const candidateBlocked = actions.some(
        (a) => a.entityType === 'BusinessCandidate' && a.entityId === candidateId && a.blocked,
      );
      if (candidateBlocked) continue;

      for (const asset of assets) {
        if (asset.sourceType === 'owner_uploaded') {
          warnings.push(`Owner-uploaded media ${asset.id} will not be deleted`);
          continue;
        }
        if (asset.usageStatus === 'blocked' || asset.usageStatus === 'archived') continue;

        actions.push({
          entityType: 'CandidateMediaAsset',
          entityId: asset.id,
          action: 'block_usage',
          previousStatus: asset.usageStatus,
          newStatus: 'archived',
          blocked: false,
        });
        affectedRecords.push({
          entityType: 'CandidateMediaAsset',
          entityId: asset.id,
          label: asset.assetType,
          previousStatus: asset.usageStatus,
          plannedStatus: 'archived',
          blocked: false,
        });
        counts.mediaAssets += 1;
      }
    }
  }

  if (opts.includeClaimIntents) {
    for (const intent of ctx.claimIntents) {
      if (intent.status === 'abandoned' || intent.status === 'abandoned_rollback') continue;

      const linkedBlocked =
        (intent.candidateId &&
          actions.some(
            (a) => a.entityType === 'BusinessCandidate' && a.entityId === intent.candidateId && a.blocked,
          )) ||
        (intent.seedId &&
          actions.some((a) => a.entityType === 'BusinessSeed' && a.entityId === intent.seedId && a.blocked));

      if (linkedBlocked) continue;

      if (
        (intent.status === 'registered' || intent.status === 'verified') &&
        (!opts.force || !canForce)
      ) {
        const blockReason = `Claim intent ${intent.id}: active after registration requires force`;
        blockedReasons.push(blockReason);
        counts.blocked += 1;
        needsForce = true;
        actions.push({
          entityType: 'ClaimIntent',
          entityId: intent.id,
          action: 'block',
          previousStatus: intent.status,
          newStatus: null,
          blocked: true,
          blockReason,
        });
        continue;
      }

      actions.push({
        entityType: 'ClaimIntent',
        entityId: intent.id,
        action: 'abandon_rollback',
        previousStatus: intent.status,
        newStatus: 'abandoned_rollback',
        blocked: false,
      });
      affectedRecords.push({
        entityType: 'ClaimIntent',
        entityId: intent.id,
        label: intent.source,
        previousStatus: intent.status,
        plannedStatus: 'abandoned_rollback',
        blocked: false,
      });
      counts.claimIntents += 1;
    }
  }

  return { actions, affectedRecords, blockedReasons, warnings, counts, needsForce };
}

function resolveSafetyLevel(
  counts: RollbackAffectedCounts,
  blockedReasons: string[],
  needsForce: boolean,
): RollbackSafetyLevel {
  if (counts.candidates + counts.seeds + counts.briefs === 0 && blockedReasons.length > 0) {
    return 'BLOCKED';
  }
  if (blockedReasons.length > 0 && counts.blocked > 0 && counts.candidates + counts.seeds === 0) {
    return 'BLOCKED';
  }
  if (needsForce || counts.briefs > 0 || counts.claimIntents > 0 || counts.seeds > 0) {
    return 'NEEDS_CONFIRMATION';
  }
  if (counts.candidates > 0) return 'NEEDS_CONFIRMATION';
  return 'SAFE';
}

function buildPreview(
  actions: RollbackPlannedAction[],
  affectedRecords: RollbackAffectedRecord[],
  blockedReasons: string[],
  warnings: string[],
  counts: RollbackAffectedCounts,
  needsForce: boolean,
): Omit<RollbackDryRunPreview, 'job'> {
  const safetyLevel = resolveSafetyLevel(counts, blockedReasons, needsForce);
  const requiredPermissions = requiredPermissionsForPlan({
    needsConfirmation: safetyLevel === 'NEEDS_CONFIRMATION',
    needsForce,
  });

  let recommendedAction = 'Proceed with execute after operator confirmation.';
  if (safetyLevel === 'BLOCKED') {
    recommendedAction = 'Rollback blocked. Resolve blockers or use force permission where appropriate.';
  } else if (needsForce) {
    recommendedAction = 'Elevated force permission required for verified or published records.';
  }

  return {
    safetyLevel,
    affectedCounts: counts,
    affectedRecords,
    blockedReasons: [...new Set(blockedReasons)],
    warnings: [...new Set(warnings)],
    requiredPermissions,
    recommendedAction,
  };
}

async function collectPublishedChecks(
  candidates: BusinessCandidateRecord[],
  seeds: IngestedSeedRecord[],
): Promise<Map<string, boolean>> {
  const storeIds = new Set<string>();
  for (const c of candidates) if (c.storeId) storeIds.add(c.storeId);
  for (const s of seeds) if (s.storeId) storeIds.add(s.storeId);

  const map = new Map<string, boolean>();
  await Promise.all(
    [...storeIds].map(async (id) => {
      map.set(id, await isStorePublished(id));
    }),
  );
  return map;
}

export async function planBatchRollback(
  input: BatchRollbackInput,
  actor: RollbackActor,
): Promise<
  | { ok: false; error: string }
  | { ok: true; preview: Omit<RollbackDryRunPreview, 'job'>; actions: RollbackPlannedAction[] }
> {
  if (isProtectedBatch0(input.batchId)) {
    return { ok: false, error: 'Batch 0 is protected and cannot be rolled back.' };
  }

  const candidates = (await listBusinessCandidatesByBatch(input.batchId)).filter(
    (c) => c.status !== 'DUPLICATE',
  );
  const ctx = await buildScopeForCandidates(candidates);
  const publishedStoreChecks = await collectPublishedChecks(ctx.candidates, ctx.seeds);

  const opts: PlanOptions = {
    includeQaApproved: input.includeQaApproved !== false,
    includeClaimableSeeds: input.includeClaimableSeeds !== false,
    includeBriefs: input.includeBriefs !== false,
    includeMedia: input.includeMedia !== false,
    includeClaimIntents: input.includeClaimIntents !== false,
    force: input.force === true,
    actor,
  };

  const plan = planForScope(ctx, opts, publishedStoreChecks);
  const preview = buildPreview(
    plan.actions,
    plan.affectedRecords,
    plan.blockedReasons,
    plan.warnings,
    plan.counts,
    plan.needsForce,
  );

  return { ok: true, preview, actions: plan.actions };
}

export async function planBusinessRollback(
  input: BusinessRollbackInput,
  actor: RollbackActor,
): Promise<
  | { ok: false; error: string }
  | { ok: true; preview: Omit<RollbackDryRunPreview, 'job'>; actions: RollbackPlannedAction[] }
> {
  let candidate: BusinessCandidateRecord | null = null;
  let seed: IngestedSeedRecord | null = null;

  if (input.candidateId) {
    candidate = await getBusinessCandidateById(input.candidateId);
  }
  if (input.seedId) {
    seed = await getSeedRecordById(input.seedId);
    if (!candidate && seed) {
      candidate = await getBusinessCandidateBySeedId(seed.id);
    }
  }
  if (input.storeId && !candidate && !seed) {
    const allSeeds = await listSeedRecords();
    seed = allSeeds.find((s) => s.storeId === input.storeId) ?? null;
    if (seed) candidate = await getBusinessCandidateBySeedId(seed.id);
  }

  if (!candidate && !seed) {
    return { ok: false, error: 'No business found for the given identifiers.' };
  }

  if (candidate?.batchId && isProtectedBatch0(candidate.batchId)) {
    return { ok: false, error: 'Batch 0 is protected and cannot be rolled back.' };
  }
  if (seed?.batchId && isProtectedBatch0(seed.batchId)) {
    return { ok: false, error: 'Batch 0 is protected and cannot be rolled back.' };
  }

  const candidates = candidate ? [candidate] : [];
  const ctx = await buildScopeForCandidates(candidates);
  if (seed && !ctx.seeds.some((s) => s.id === seed!.id)) {
    ctx.seeds.push(seed);
  }

  const publishedStoreChecks = await collectPublishedChecks(ctx.candidates, ctx.seeds);
  const opts: PlanOptions = {
    includeQaApproved: true,
    includeClaimableSeeds: true,
    includeBriefs: input.includeBriefs !== false,
    includeMedia: input.includeMedia !== false,
    includeClaimIntents: input.includeClaimIntents !== false,
    force: input.force === true,
    actor,
  };

  const plan = planForScope(ctx, opts, publishedStoreChecks);
  const preview = buildPreview(
    plan.actions,
    plan.affectedRecords,
    plan.blockedReasons,
    plan.warnings,
    plan.counts,
    plan.needsForce,
  );

  return { ok: true, preview, actions: plan.actions };
}
