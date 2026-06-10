/**
 * Mission Pipeline v1: create, approve, cancel, retry, resume.
 * All transitions go through canTransitionMissionPipeline.
 */

import { getPrismaClient } from '../lib/prisma.js';
import { canTransitionMissionPipeline } from './missionPipelineTransitions.js';
import { buildDefaultMissionSteps } from './missionPipelineSteps.js';
import { insertMissingPipelineSteps } from './missionPipelineStepWriter.js';
import { getStructuredMissionSteps } from './missionPipelineStructured.js';
import { normalizeLocale } from './localePrompt.js';
import { getTaskGraphFromMetadata } from './agentPlanning/taskGraphPersistence.js';
import { materializeStepsFromTaskGraph } from './agentPlanning/taskGraphMaterialize.js';
import { runPostMissionCompletionSummary } from './missionCompletion/postMissionSummary.js';
import { isPerformerPipelineWriteHardeningEnabled } from './broker/brokerFlags.js';
import { safePipelineUpdate } from './safePipelineUpdate.js';
import { runMissionCreateBurst } from './mission/missionCreateBurst.js';
import { withParentMissionIdInMetadata } from './mission/missionParentLineage.js';
import {
  attachStoreMissionIdempotencyKey,
  findRecentStoreMissionByIdempotencyKey,
  runMissionCreateWrite,
} from './mission/missionCreateWrite.js';

/** SQLite creation txn — bounded wait under contention (Step 6; no retry loop). */
const CREATION_TX_TIMEOUT_MS = 30_000;

const PERFORMER_DRIVEN_TYPES = new Set(['launch_campaign', 'create_promotion', 'code_fix']);

const TERMINAL_STATUSES = ['completed', 'cancelled'];

/**
 * @param {object} params
 * @param {string} params.type
 * @param {string} params.title
 * @param {string} params.targetType
 * @param {string} [params.targetId]
 * @param {string} [params.targetLabel]
 * @param {string} [params.parentMissionId]
 * @param {object} [params.metadata]
 * @param {boolean} [params.requiresConfirmation]
 * @param {string} [params.tenantId]
 * @param {string} [params.createdBy]
 * @param {'AUTO_RUN'|'GUIDED_RUN'} [params.executionMode] — default AUTO_RUN
 * @returns {Promise<{ id: string, status: string, stepsCreated: number }>}
 */
/**
 * Resolve execution mode and step configs from create params (no DB writes).
 * @param {Parameters<typeof createMissionPipeline>[0]} params
 */
export function buildStepConfigsForMissionPipeline(params) {
  const {
    type,
    metadata = {},
    requiresConfirmation = false,
    executionMode = 'AUTO_RUN',
  } = params;
  const mode = executionMode === 'GUIDED_RUN' ? 'GUIDED_RUN' : 'AUTO_RUN';
  const effectiveRequiresConfirmation =
    Boolean(requiresConfirmation) || PERFORMER_DRIVEN_TYPES.has(String(type).trim());

  const missionType = String(type).trim() || 'generic';
  let stepConfigs = buildDefaultMissionSteps(missionType, metadata);
  const pipelineLocale = normalizeLocale(
    metadata?.locale ?? metadata?.preferredLocale ?? metadata?.lang,
  );
  const structured = getStructuredMissionSteps(missionType, pipelineLocale);
  if (Array.isArray(structured) && structured.length > 0) {
    stepConfigs = structured;
  }
  const plannedGraph = getTaskGraphFromMetadata(metadata);
  if (plannedGraph) {
    const fromGraph = materializeStepsFromTaskGraph(plannedGraph);
    if (fromGraph.length > 0) stepConfigs = fromGraph;
  }
  if (!Array.isArray(stepConfigs) || stepConfigs.length === 0) {
    const t = missionType.toLowerCase();
    switch (t) {
      case 'launch_campaign':
        stepConfigs = [
          { toolName: 'market_research', label: 'Research', orderIndex: 0 },
          { toolName: 'consensus', label: 'Consensus', orderIndex: 1 },
          { toolName: 'analyze_store', label: 'Analysis', orderIndex: 2 },
          { toolName: 'create_promotion', label: 'Promotion', orderIndex: 3 },
          { toolName: 'activate_promotion', label: 'Activation', orderIndex: 4 },
          { toolName: 'content_creator', label: 'Content', orderIndex: 5 },
          { toolName: 'crm', label: 'CRM', orderIndex: 6 },
        ];
        break;
      case 'rewrite_descriptions':
        stepConfigs = [
          { toolName: 'analyze_store', label: 'Analysing your products', orderIndex: 0 },
          { toolName: 'rewrite_descriptions', label: 'Rewriting descriptions', orderIndex: 1 },
        ];
        break;
      case 'generate_tags':
        stepConfigs = [
          { toolName: 'analyze_store', label: 'Analysing your products', orderIndex: 0 },
          { toolName: 'generate_tags', label: 'Generating tags', orderIndex: 1 },
        ];
        break;
      case 'generate_social':
        stepConfigs = [
          { toolName: 'analyze_store', label: 'Analysing your store', orderIndex: 0 },
          { toolName: 'generate_social_posts', label: 'Creating social posts', orderIndex: 1 },
        ];
        break;
      case 'create_offer':
        stepConfigs = [
          { toolName: 'analyze_store', label: 'Checking your store', orderIndex: 0 },
          { toolName: 'create_offer', label: 'Creating offer', orderIndex: 1 },
          { toolName: 'assign_promotion_slot', label: 'Activating offer', orderIndex: 2 },
        ];
        break;
      case 'improve_hero':
        stepConfigs = [
          { toolName: 'analyze_store', label: 'Analysing your store', orderIndex: 0 },
          { toolName: 'improve_hero', label: 'Updating hero section', orderIndex: 1 },
        ];
        break;
      default:
        break;
    }
  }

  return { stepConfigs, effectiveRequiresConfirmation, mode };
}

/**
 * Creation-phase DB writes only (caller supplies prisma or transaction client).
 * Shadow Mission upsert is intentionally OUT of scope — run ensureShadowMissionRowBestEffort after commit.
 *
 * @param {object} prisma
 * @param {Parameters<typeof createMissionPipeline>[0]} params
 * @param {{ stepConfigs: object[], effectiveRequiresConfirmation: boolean, mode: string }} prepared
 * @returns {Promise<{ id: string, status: string, stepsCreated: number }>}
 */
export async function createMissionPipelineCore(prisma, params, prepared) {
  const {
    type,
    title,
    targetType,
    targetId = '',
    targetLabel,
    parentMissionId = null,
    metadata = {},
    tenantId = null,
    createdBy = null,
  } = params;
  const { stepConfigs, effectiveRequiresConfirmation, mode } = prepared;

  const parentId =
    parentMissionId != null && String(parentMissionId).trim() ? String(parentMissionId).trim() : null;
  const metadataJson = withParentMissionIdInMetadata(
    metadata && typeof metadata === 'object' ? metadata : {},
    parentId,
  );

  const mission = await prisma.missionPipeline.create({
    data: {
      type: String(type).trim() || 'generic',
      title: String(title).trim() || 'Untitled mission',
      targetType: String(targetType).trim() || 'generic',
      targetId: targetId != null ? String(targetId) : null,
      targetLabel: targetLabel != null ? String(targetLabel).trim() || null : null,
      status: 'requested',
      runState: 'idle',
      executionMode: mode,
      tenantId,
      createdBy,
      requiresConfirmation: effectiveRequiresConfirmation,
      metadataJson,
      progressCompletedSteps: 0,
      progressTotalSteps: 0,
    },
  });

  let stepsCreated = 0;
  if (stepConfigs.length > 0) {
    await insertMissingPipelineSteps(
      prisma,
      mission.id,
      stepConfigs.map((c) => ({
        missionId: mission.id,
        orderIndex: c.orderIndex,
        toolName: c.toolName,
        label: c.label,
        status: 'pending',
        stepKind: c.stepKind || 'action',
        ...(c.configJson != null && typeof c.configJson === 'object' ? { configJson: c.configJson } : {}),
        ...(c.inputJson != null && typeof c.inputJson === 'object' ? { inputJson: c.inputJson } : {}),
      })),
      { logPrefix: '[MissionSteps]' },
    );
    stepsCreated = stepConfigs.length;
    await safePipelineUpdate(
      prisma,
      { where: { id: mission.id }, data: { progressTotalSteps: stepsCreated } },
      { label: 'create.progressTotalSteps' },
    );
  } else if (mode === 'AUTO_RUN') {
    await safePipelineUpdate(
      prisma,
      { where: { id: mission.id }, data: { progressTotalSteps: 1, progressCompletedSteps: 0 } },
      { label: 'create.autoRunProgress' },
    );
  }

  if (!canTransitionMissionPipeline('requested', 'planned')) {
    return { id: mission.id, status: mission.status, stepsCreated };
  }
  await safePipelineUpdate(
    prisma,
    { where: { id: mission.id }, data: { status: 'planned' } },
    { label: 'create.statusPlanned' },
  );

  const nextStatus = effectiveRequiresConfirmation ? 'awaiting_confirmation' : 'queued';
  if (!canTransitionMissionPipeline('planned', nextStatus)) {
    return { id: mission.id, status: 'planned', stepsCreated };
  }
  await safePipelineUpdate(
    prisma,
    { where: { id: mission.id }, data: { status: nextStatus } },
    { label: 'create.statusNext' },
  );

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[Mission] created: ${mission.id} type=${mission.type}`);
    console.log(`[Mission] transition: requested -> planned mission=${mission.id}`);
    console.log(`[Mission] transition: planned -> ${nextStatus} mission=${mission.id}`);
    if (stepsCreated > 0) console.log(`[MissionSteps] built default steps: ${stepsCreated} for type=${mission.type}`);
  }

  return {
    id: mission.id,
    status: nextStatus,
    stepsCreated,
  };
}

/**
 * Best-effort shadow Mission row after pipeline creation (non-fatal; outside creation txn).
 * @param {object} prisma
 * @param {{ id: string, title?: string|null }} missionResult
 * @param {Parameters<typeof createMissionPipeline>[0]} params
 */
export async function ensureShadowMissionRowBestEffort(prisma, missionResult, params) {
  const { tenantId = null, createdBy = null } = params;
  const tenantFallback =
    (tenantId != null && String(tenantId).trim()) ||
    (createdBy != null && String(createdBy).trim()) ||
    'temp';
  const createdByTrimmed = createdBy != null ? String(createdBy).trim() : '';
  const isPlaceholder = createdByTrimmed === 'temp' || createdByTrimmed === 'dev-user-id' || createdByTrimmed === '';
  const isGuestCreatedBy =
    createdByTrimmed.length > 0 && createdByTrimmed.toLowerCase().startsWith('guest_');
  if (isGuestCreatedBy) {
    const { ensureShadowUserRowForGuest } = await import('./mission.js');
    await ensureShadowUserRowForGuest(prisma, createdByTrimmed);
  }
  let isRealUserId = false;
  if (!isPlaceholder) {
    const existingUser = await prisma.user
      .findUnique({ where: { id: createdByTrimmed }, select: { id: true } })
      .catch(() => null);
    isRealUserId = Boolean(existingUser?.id);
  }
  if (isRealUserId) {
    try {
      await prisma.mission.upsert({
        where: { id: missionResult.id },
        create: {
          id: missionResult.id,
          tenantId: tenantFallback,
          createdByUserId: createdByTrimmed,
          title: missionResult.title != null ? String(missionResult.title).trim() || null : null,
          status: 'active',
        },
        update: {},
      });
    } catch (err) {
      console.warn('[missionPipelineService] shadow Mission upsert failed (non-fatal):', err?.message || err);
    }
  } else if (process.env.NODE_ENV !== 'production') {
    console.log('[missionPipelineService] skipping shadow Mission upsert (no real user):', {
      missionId: missionResult.id,
      tenantId: tenantFallback,
      createdBy: createdByTrimmed || null,
    });
  }
}

async function createMissionPipelineImpl(params) {
  const paramsWithIdempotency = attachStoreMissionIdempotencyKey(params);
  const idempotencyKey =
    paramsWithIdempotency.metadata &&
    typeof paramsWithIdempotency.metadata === 'object' &&
    !Array.isArray(paramsWithIdempotency.metadata)
      ? paramsWithIdempotency.metadata.idempotencyKey
      : null;

  return runMissionCreateWrite(async () => {
    const prisma = getPrismaClient();
    const prepared = buildStepConfigsForMissionPipeline(paramsWithIdempotency);

    if (
      idempotencyKey &&
      paramsWithIdempotency.createdBy &&
      String(paramsWithIdempotency.type ?? '').trim().toLowerCase() === 'store'
    ) {
      const existing = await findRecentStoreMissionByIdempotencyKey(
        prisma,
        String(idempotencyKey),
        String(paramsWithIdempotency.createdBy),
      );
      if (existing?.id) {
        if (process.env.NODE_ENV !== 'production') {
          console.log('[mission-create] reused_existing', {
            missionId: existing.id,
            idempotencyKey,
          });
        }
        return { id: existing.id, status: existing.status, stepsCreated: 0, reused: true };
      }
    }

    let result;
    if (isPerformerPipelineWriteHardeningEnabled()) {
      result = await prisma.$transaction(
        (tx) => createMissionPipelineCore(tx, paramsWithIdempotency, prepared),
        { timeout: CREATION_TX_TIMEOUT_MS },
      );
    } else {
      result = await createMissionPipelineCore(prisma, paramsWithIdempotency, prepared);
    }

    await ensureShadowMissionRowBestEffort(prisma, { id: result.id, title: paramsWithIdempotency.title }, paramsWithIdempotency);

    const metaForContinuation =
      paramsWithIdempotency.metadata &&
      typeof paramsWithIdempotency.metadata === 'object' &&
      !Array.isArray(paramsWithIdempotency.metadata)
        ? paramsWithIdempotency.metadata
        : null;
    const continuationContract =
      metaForContinuation?.continuationContract &&
      typeof metaForContinuation.continuationContract === 'object'
        ? metaForContinuation.continuationContract
        : null;

    if (continuationContract && process.env.ENABLE_MISSION_HANDOFF === 'true') {
      const { logMissionContinuationSpawned } = await import('./missionContinuationService.js');
      await logMissionContinuationSpawned({
        childMissionId: result.id,
        contract: continuationContract,
      });
    }

    return result;
  }, { label: 'missionPipeline.create' });
}

export async function createMissionPipeline(params) {
  return runMissionCreateBurst('pipeline', () => createMissionPipelineImpl(params));
}

/**
 * @param {string} missionId
 * @param {string} fromStatus
 * @param {string} toStatus
 * @param {object} [extra]
 * @returns {Promise<boolean>} true if updated
 */
async function transitionMission(missionId, fromStatus, toStatus, extra = {}) {
  const prisma = getPrismaClient();
  if (!canTransitionMissionPipeline(fromStatus, toStatus)) return false;
  const data = { status: toStatus, ...extra };
  if (toStatus === 'cancelled') data.cancelledAt = new Date();
  if (toStatus === 'completed') data.completedAt = new Date();
  if (toStatus === 'failed') data.failedAt = new Date();
  await prisma.missionPipeline.update({
    where: { id: missionId },
    data,
  });
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[Mission] transition: ${fromStatus} -> ${toStatus} mission=${missionId}`);
  }
  return true;
}

/**
 * @param {string} missionId
 * @returns {Promise<{ ok: boolean, status?: string, error?: string }>}
 */
export async function approveMissionPipeline(missionId) {
  const prisma = getPrismaClient();
  const m = await prisma.missionPipeline.findUnique({ where: { id: missionId }, select: { status: true } });
  if (!m) return { ok: false, error: 'not_found' };
  if (m.status !== 'awaiting_confirmation') return { ok: false, error: 'invalid_state', status: m.status };
  const updated = await transitionMission(missionId, 'awaiting_confirmation', 'queued');
  if (!updated) return { ok: false, error: 'transition_failed' };
  if (process.env.NODE_ENV !== 'production') console.log('[MissionAPI] approve');
  return { ok: true, status: 'queued' };
}

/**
 * Cancel non-terminal pipeline steps so the runner cannot pick them up after cancel.
 * @param {import('../lib/prismaClient.js').PrismaClient} prisma
 * @param {string} missionId
 */
async function cancelActivePipelineSteps(prisma, missionId) {
  await prisma.missionPipelineStep.updateMany({
    where: {
      missionId,
      status: { notIn: ['completed', 'cancelled', 'failed', 'skipped'] },
    },
    data: { status: 'cancelled' },
  });
}

/**
 * Shadow Mission row + blackboard + SSE after pipeline cancel.
 * @param {import('../lib/prismaClient.js').PrismaClient} prisma
 * @param {string} missionId
 * @param {string|null} userId
 */
async function emitMissionCancelledSideEffects(prisma, missionId, userId) {
  await prisma.mission
    .updateMany({
      where: { id: missionId },
      data: { status: 'cancelled', updatedAt: new Date() },
    })
    .catch(() => {});

  try {
    const { appendEvent } = await import('./missionBlackboard.js');
    await appendEvent(
      missionId,
      'mission_cancelled',
      {
        cancelledBy: userId ?? null,
        cancelledAt: new Date().toISOString(),
      },
      { agentId: 'system' },
    );
  } catch (e) {
    console.warn('[cancelMissionPipeline] blackboard event failed (non-fatal):', e?.message || e);
  }

  try {
    const { broadcastMissionCancelled } = await import('../realtime/simpleSse.js');
    broadcastMissionCancelled(missionId, { status: 'cancelled', runState: 'done' });
  } catch (e) {
    console.warn('[cancelMissionPipeline] SSE cancel failed (non-fatal):', e?.message || e);
  }
}

/**
 * @param {string} missionId
 * @param {{ userId?: string|null }} [options]
 * @returns {Promise<{ ok: boolean, status?: string, error?: string, dismissed?: boolean }>}
 */
export async function cancelMissionPipeline(missionId, options = {}) {
  const userId = options?.userId != null ? String(options.userId).trim() || null : null;
  const prisma = getPrismaClient();
  const { buildEndedByUserMetadata } = await import('./runtime/missionRuntimeEnd.js');
  const m = await prisma.missionPipeline.findUnique({
    where: { id: missionId },
    select: { status: true, outputsJson: true, metadataJson: true, runState: true },
  });
  if (!m) return { ok: false, error: 'not_found' };

  const cancelRuntimeData = (metadataJson) => ({
    metadataJson: buildEndedByUserMetadata(metadataJson),
    runState: 'done',
    currentStepId: null,
    cancelledAt: new Date(),
  });

  if (TERMINAL_STATUSES.includes(m.status)) {
    const st = String(m.status ?? '').toLowerCase();
    if (st === 'cancelled' || st === 'canceled') {
      await prisma.missionPipeline.update({
        where: { id: missionId },
        data: cancelRuntimeData(m.metadataJson),
      });
      await cancelActivePipelineSteps(prisma, missionId);
      await emitMissionCancelledSideEffects(prisma, missionId, userId);
      console.log('[mission-end] cleared active runtime session', { missionId, idempotent: true });
      return { ok: true, status: 'cancelled' };
    }
    // User "End mission" on a completed/success terminal row — dismiss so runtime session won't rehydrate it.
    const dismissTerminal = ['completed', 'done', 'succeeded', 'success'].includes(st);
    if (dismissTerminal) {
      await prisma.missionPipeline.update({
        where: { id: missionId },
        data: {
          metadataJson: buildEndedByUserMetadata(m.metadataJson),
          currentStepId: null,
          runState: 'done',
        },
      });
      console.log('[mission-end] dismissed completed mission', { missionId, status: st });
      return { ok: true, status: st, dismissed: true };
    }
    return { ok: false, error: 'already_terminal', status: m.status };
  }

  const updated = await transitionMission(missionId, m.status, 'cancelled', { runState: 'done' });
  if (!updated) return { ok: false, error: 'transition_failed' };
  await prisma.missionPipeline.update({
    where: { id: missionId },
    data: cancelRuntimeData(m.metadataJson),
  });
  await cancelActivePipelineSteps(prisma, missionId);
  console.log('[mission-end] cleared active runtime session', { missionId });
  if (process.env.NODE_ENV !== 'production') console.log('[MissionAPI] cancel');

  const out = m.outputsJson && typeof m.outputsJson === 'object' ? m.outputsJson : {};
  const jobId = typeof out.jobId === 'string' && out.jobId.trim() ? out.jobId.trim() : null;
  if (jobId) {
    try {
      const { transitionOrchestratorTaskStatus } = await import('../kernel/transitions/transitionService.js');
      await transitionOrchestratorTaskStatus({
        prisma,
        taskId: jobId,
        toStatus: 'failed',
        fromStatus: 'running',
        actorType: 'system',
        correlationId: missionId,
        reason: 'MISSION_PIPELINE_CANCELLED',
        result: { ok: false, cancelled: true, missionPipelineId: missionId },
      });
      await transitionOrchestratorTaskStatus({
        prisma,
        taskId: jobId,
        toStatus: 'failed',
        fromStatus: 'queued',
        actorType: 'system',
        correlationId: missionId,
        reason: 'MISSION_PIPELINE_CANCELLED',
        result: { ok: false, cancelled: true, missionPipelineId: missionId },
      });
    } catch (e) {
      console.warn('[cancelMissionPipeline] orchestrator task cancel:', e?.message || e);
    }
  }

  await emitMissionCancelledSideEffects(prisma, missionId, userId);

  return { ok: true, status: 'cancelled' };
}

/**
 * @param {string} missionId
 * @returns {Promise<{ ok: boolean, status?: string, error?: string }>}
 */
export async function retryMissionPipeline(missionId) {
  const prisma = getPrismaClient();
  const m = await prisma.missionPipeline.findUnique({ where: { id: missionId }, select: { status: true } });
  if (!m) return { ok: false, error: 'not_found' };
  if (m.status !== 'failed') return { ok: false, error: 'invalid_state', status: m.status };
  const updated = await transitionMission(missionId, 'failed', 'queued');
  if (!updated) return { ok: false, error: 'transition_failed' };
  if (process.env.NODE_ENV !== 'production') console.log('[MissionAPI] retry');
  return { ok: true, status: 'queued' };
}

/**
 * @param {string} missionId
 * @returns {Promise<{ ok: boolean, status?: string, error?: string }>}
 */
export async function resumeMissionPipeline(missionId) {
  const prisma = getPrismaClient();
  const m = await prisma.missionPipeline.findUnique({ where: { id: missionId }, select: { status: true } });
  if (!m) return { ok: false, error: 'not_found' };
  if (m.status !== 'paused') return { ok: false, error: 'invalid_state', status: m.status };
  const updated = await transitionMission(missionId, 'paused', 'queued');
  if (!updated) return { ok: false, error: 'transition_failed' };
  if (process.env.NODE_ENV !== 'production') console.log('[MissionAPI] resume');
  return { ok: true, status: 'queued' };
}

/**
 * When the pipeline is queued but has no pending steps (e.g. create-store with no stepToolNames),
 * mark the mission completed so the client gets a terminal state and stops polling.
 *
 * @param {string} missionId
 * @returns {Promise<boolean>} true if transition was applied
 */
export async function completeMissionWhenNoSteps(missionId) {
  const prisma = getPrismaClient();
  const m = await prisma.missionPipeline.findUnique({ where: { id: missionId }, select: { status: true } });
  if (!m || m.status !== 'queued') return false;
  const updated = await transitionMission(missionId, 'queued', 'completed', { runState: 'done' });
  if (updated && process.env.NODE_ENV !== 'production') {
    console.log('[MissionAPI] completed (no pending steps) mission=', missionId);
  }
  if (updated) {
    const row = await prisma.missionPipeline.findUnique({
      where: { id: missionId },
      select: { type: true, outputsJson: true, metadataJson: true },
    });
    if (row) {
      const outputsForSummary =
        row.outputsJson && typeof row.outputsJson === 'object' && !Array.isArray(row.outputsJson)
          ? row.outputsJson
          : {};
      void runPostMissionCompletionSummary({
        missionId,
        missionType: row.type ?? null,
        metadataJson: row.metadataJson,
        outputsJson: outputsForSummary,
      }).catch(() => {});
    }
  }
  return updated;
}

/**
 * Pause shadow Mission row (agent-chat registry) while waiting for user approval (e.g. website patch).
 * @param {string} missionId
 * @param {unknown} [reason] e.g. metadata object from miniWebsiteAgent proposer
 * @returns {Promise<{ ok: boolean, missionId?: string, status?: string, error?: string }>}
 */
export async function pauseMissionPipeline(missionId, reason) {
  console.log('[MissionPipeline] Pause:', missionId, reason);
  try {
    const { getPrismaClient } = await import('../lib/prisma.js');
    const prisma = getPrismaClient();
    await prisma.mission.update({
      where: { id: missionId },
      data: { status: 'paused' },
    });
    return { ok: true, missionId, status: 'paused' };
  } catch (e) {
    console.warn('[MissionPipeline] pauseMissionPipeline error:', e?.message || e);
    return { ok: false, error: e?.message || String(e) };
  }
}
