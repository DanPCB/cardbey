/**
 * Discovery rollback orchestration — dry-run and execute flows.
 */

import { planBatchRollback, planBusinessRollback } from './rollbackPlanner.js';
import { executeRollbackActions } from './rollbackExecutor.js';
import {
  newRollbackJobId,
  saveRollbackJob,
  getRollbackJobById,
  listRollbackJobs,
} from './rollbackRepository.js';
import {
  hasRollbackDiscoveryPermission,
  hasRollbackForcePermission,
  PERM_ROLLBACK_FORCE,
} from './rollbackPermissions.js';
import type {
  BatchRollbackInput,
  BusinessRollbackInput,
  RollbackDryRunPreview,
  RollbackJob,
} from './types.js';
import type { RollbackActor } from './rollbackPermissions.js';

function actorFromUser(user: { id: string; role?: string | null; permissions?: string[] | null } | undefined): RollbackActor | null {
  if (!user?.id) return null;
  return { id: user.id, role: user.role, permissions: user.permissions };
}

function buildJobBase(
  actor: RollbackActor,
  reason: string,
  rollbackType: RollbackJob['rollbackType'],
  ids: Pick<RollbackJob, 'batchId' | 'candidateId' | 'seedId' | 'storeId'>,
): RollbackJob {
  const now = new Date().toISOString();
  return {
    id: newRollbackJobId(),
    rollbackType,
    batchId: ids.batchId,
    candidateId: ids.candidateId,
    seedId: ids.seedId,
    storeId: ids.storeId,
    requestedByUserId: actor.id,
    reason,
    mode: 'DRY_RUN',
    status: 'PENDING',
    safetyLevel: 'SAFE',
    affectedCountsJson: {
      candidates: 0,
      seeds: 0,
      briefs: 0,
      mediaAssets: 0,
      claimIntents: 0,
      storeDrafts: 0,
      blocked: 0,
    },
    affectedRecordsJson: [],
    blockedReasonsJson: [],
    rollbackActionsJson: [],
    warningsJson: [],
    requiredPermissionsJson: [],
    createdAt: now,
    startedAt: null,
    completedAt: null,
    dryRunJobId: null,
  };
}

export async function runBatchRollbackDryRun(
  input: BatchRollbackInput,
  user: { id: string; role?: string | null; permissions?: string[] | null } | undefined,
): Promise<{ ok: false; error: string; code?: string } | { ok: true; preview: RollbackDryRunPreview }> {
  const actor = actorFromUser(user);
  if (!hasRollbackDiscoveryPermission(actor)) {
    return { ok: false, error: 'Insufficient permissions.', code: 'forbidden' };
  }

  const planned = await planBatchRollback(input, actor!);
  if (!planned.ok) return { ok: false, error: planned.error, code: 'batch_protected' };

  const job = buildJobBase(actor!, input.reason, 'BATCH', {
    batchId: input.batchId,
    candidateId: null,
    seedId: null,
    storeId: null,
  });
  job.mode = 'DRY_RUN';
  job.status = 'COMPLETED';
  job.safetyLevel = planned.preview.safetyLevel;
  job.affectedCountsJson = planned.preview.affectedCounts;
  job.affectedRecordsJson = planned.preview.affectedRecords;
  job.blockedReasonsJson = planned.preview.blockedReasons;
  job.rollbackActionsJson = planned.actions;
  job.warningsJson = planned.preview.warnings;
  job.requiredPermissionsJson = planned.preview.requiredPermissions;
  job.startedAt = job.createdAt;
  job.completedAt = new Date().toISOString();

  await saveRollbackJob(job);

  return {
    ok: true,
    preview: {
      job,
      ...planned.preview,
    },
  };
}

export async function runBatchRollbackExecute(
  params: { dryRunJobId: string; reason?: string },
  user: { id: string; role?: string | null; permissions?: string[] | null } | undefined,
): Promise<{ ok: false; error: string; code?: string } | { ok: true; job: RollbackJob }> {
  const actor = actorFromUser(user);
  if (!hasRollbackDiscoveryPermission(actor)) {
    return { ok: false, error: 'Insufficient permissions.', code: 'forbidden' };
  }

  const dryJob = await getRollbackJobById(params.dryRunJobId);
  if (!dryJob || dryJob.mode !== 'DRY_RUN' || dryJob.rollbackType !== 'BATCH') {
    return { ok: false, error: 'Valid dry-run job required before execute.', code: 'dry_run_required' };
  }
  if (dryJob.safetyLevel === 'BLOCKED') {
    return { ok: false, error: 'Dry run was blocked; cannot execute.', code: 'blocked' };
  }

  const needsForce = dryJob.requiredPermissionsJson.includes(PERM_ROLLBACK_FORCE);
  if (needsForce && !hasRollbackForcePermission(actor)) {
    return { ok: false, error: 'Force permission required for this rollback.', code: 'force_required' };
  }

  const now = new Date().toISOString();
  const execJob: RollbackJob = {
    ...dryJob,
    id: newRollbackJobId(),
    mode: 'EXECUTE',
    status: 'RUNNING',
    reason: params.reason?.trim() || dryJob.reason,
    dryRunJobId: dryJob.id,
    createdAt: now,
    startedAt: now,
    completedAt: null,
  };
  await saveRollbackJob(execJob);

  const result = await executeRollbackActions(execJob, dryJob.rollbackActionsJson);

  execJob.status =
    result.errors.length > 0
      ? result.applied > 0
        ? 'PARTIAL'
        : 'FAILED'
      : dryJob.blockedReasonsJson.length > 0 && result.blocked > 0
        ? 'PARTIAL'
        : 'COMPLETED';
  execJob.completedAt = new Date().toISOString();
  await saveRollbackJob(execJob);

  return { ok: true, job: execJob };
}

export async function runBusinessRollbackDryRun(
  input: BusinessRollbackInput,
  user: { id: string; role?: string | null; permissions?: string[] | null } | undefined,
): Promise<{ ok: false; error: string; code?: string } | { ok: true; preview: RollbackDryRunPreview }> {
  const actor = actorFromUser(user);
  if (!hasRollbackDiscoveryPermission(actor)) {
    return { ok: false, error: 'Insufficient permissions.', code: 'forbidden' };
  }

  const planned = await planBusinessRollback(input, actor!);
  if (!planned.ok) return { ok: false, error: planned.error, code: 'not_found' };

  const job = buildJobBase(actor!, input.reason, 'BUSINESS', {
    batchId: null,
    candidateId: input.candidateId ?? null,
    seedId: input.seedId ?? null,
    storeId: input.storeId ?? null,
  });
  job.mode = 'DRY_RUN';
  job.status = 'COMPLETED';
  job.safetyLevel = planned.preview.safetyLevel;
  job.affectedCountsJson = planned.preview.affectedCounts;
  job.affectedRecordsJson = planned.preview.affectedRecords;
  job.blockedReasonsJson = planned.preview.blockedReasons;
  job.rollbackActionsJson = planned.actions;
  job.warningsJson = planned.preview.warnings;
  job.requiredPermissionsJson = planned.preview.requiredPermissions;
  job.startedAt = job.createdAt;
  job.completedAt = new Date().toISOString();

  await saveRollbackJob(job);

  return {
    ok: true,
    preview: {
      job,
      ...planned.preview,
    },
  };
}

export async function runBusinessRollbackExecute(
  params: { dryRunJobId: string; reason?: string },
  user: { id: string; role?: string | null; permissions?: string[] | null } | undefined,
): Promise<{ ok: false; error: string; code?: string } | { ok: true; job: RollbackJob }> {
  const actor = actorFromUser(user);
  if (!hasRollbackDiscoveryPermission(actor)) {
    return { ok: false, error: 'Insufficient permissions.', code: 'forbidden' };
  }

  const dryJob = await getRollbackJobById(params.dryRunJobId);
  if (!dryJob || dryJob.mode !== 'DRY_RUN' || dryJob.rollbackType !== 'BUSINESS') {
    return { ok: false, error: 'Valid dry-run job required before execute.', code: 'dry_run_required' };
  }
  if (dryJob.safetyLevel === 'BLOCKED') {
    return { ok: false, error: 'Dry run was blocked; cannot execute.', code: 'blocked' };
  }

  const needsForce = dryJob.requiredPermissionsJson.includes(PERM_ROLLBACK_FORCE);
  if (needsForce && !hasRollbackForcePermission(actor)) {
    return { ok: false, error: 'Force permission required for this rollback.', code: 'force_required' };
  }

  const now = new Date().toISOString();
  const execJob: RollbackJob = {
    ...dryJob,
    id: newRollbackJobId(),
    mode: 'EXECUTE',
    status: 'RUNNING',
    reason: params.reason?.trim() || dryJob.reason,
    dryRunJobId: dryJob.id,
    createdAt: now,
    startedAt: now,
    completedAt: null,
  };
  await saveRollbackJob(execJob);

  const result = await executeRollbackActions(execJob, dryJob.rollbackActionsJson);

  execJob.status =
    result.errors.length > 0
      ? result.applied > 0
        ? 'PARTIAL'
        : 'FAILED'
      : 'COMPLETED';
  execJob.completedAt = new Date().toISOString();
  await saveRollbackJob(execJob);

  return { ok: true, job: execJob };
}

export async function listRollbackHistory(limit = 50): Promise<RollbackJob[]> {
  return listRollbackJobs(limit);
}
