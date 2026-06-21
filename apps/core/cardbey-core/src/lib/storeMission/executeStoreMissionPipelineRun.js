/**
 * Shared implementation for POST /api/missions/:missionId/run (store missions).
 * Used by missionsRoutes and performer intake auto-start so behavior stays identical.
 */

import { getPrismaClient } from '../prisma.js';
import { getOrCreateMission, mergeMissionContext, mergeMissionPlanStep } from '../mission.js';
import { createEmitContextUpdate } from '../missionPlan/agentMemory.js';
import { createStepReporter } from '../missionPlan/stepReporter.js';
import { approveMissionPipeline } from '../missionPipelineService.js';
import { auditedPipelineUpdate } from '../orchestrator/pipelineWriteAudit.js';
import {
  buildStoreOrchestrationPipelineWrites,
  isPipelineOutputDualWriteEnabled,
} from '../orchestrator/pipelineCanonicalResults.js';
import { mirrorOrchestraStatusToPipeline } from '../orchestraMirror.js';
import { resolveAccessibleMission, getTenantId } from '../missionAccess.js';
import { canTransitionMissionPipeline } from '../missionPipelineTransitions.js';
import { guestDraftOptsForActor } from './guestDraftOpts.js';
import { isMissionPipelineCancelledRow } from '../runtime/missionCancellationGuard.js';

/**
 * Structured checkpoint pipeline must reach awaiting_input (or keep executing) before intake reports success.
 * @param {{ ok?: boolean, status?: string, runState?: string, stepsRun?: number, stoppedReason?: string }} orch
 * @param {{ status?: string, runState?: string } | null} missionRow
 * @returns {{ ok: true } | { ok: false, statusCode: number, error: string, message: string }}
 */
export function evaluateStructuredCheckpointRunResult(orch, missionRow) {
  const finalStatus = String(missionRow?.status ?? orch?.status ?? '')
    .trim()
    .toLowerCase();
  const runState = String(missionRow?.runState ?? orch?.runState ?? '')
    .trim()
    .toLowerCase();
  const stoppedReason = String(orch?.stoppedReason ?? '').trim();
  const stepsRun = typeof orch?.stepsRun === 'number' && orch.stepsRun >= 0 ? orch.stepsRun : 0;

  const checkpointReached =
    finalStatus === 'awaiting_input' ||
    runState === 'blocked_on_checkpoint' ||
    stoppedReason === 'awaiting_checkpoint';

  if (checkpointReached) {
    return { ok: true };
  }

  if (finalStatus === 'executing' && stepsRun > 0) {
    return { ok: true };
  }

  if (finalStatus === 'completed' || finalStatus === 'failed' || finalStatus === 'cancelled') {
    return { ok: true };
  }

  if (!orch?.ok || stoppedReason === 'invalid_state') {
    return {
      ok: false,
      statusCode: 409,
      error: 'pipeline_run_failed',
      message: `Store pipeline did not reach a checkpoint (reason: ${stoppedReason || 'invalid_state'}, status: ${finalStatus || 'unknown'}).`,
    };
  }

  if (
    stoppedReason === 'no_pending_steps' &&
    (finalStatus === 'queued' || finalStatus === 'awaiting_confirmation' || finalStatus === 'idle' || !finalStatus)
  ) {
    return {
      ok: false,
      statusCode: 409,
      error: 'pipeline_not_started',
      message: 'Store pipeline did not start — no steps advanced from queued state.',
    };
  }

  if (finalStatus === 'queued' || finalStatus === 'awaiting_confirmation' || finalStatus === 'idle') {
    return {
      ok: false,
      statusCode: 409,
      error: 'pipeline_run_incomplete',
      message: `Store pipeline did not reach checkpoint (status: ${finalStatus || 'unknown'}, reason: ${stoppedReason || 'none'}).`,
    };
  }

  return { ok: true };
}

/**
 * Store POST /run expects the pipeline in `queued`. `approveMissionPipeline` only advances
 * `awaiting_confirmation` → `queued`. Missions can still be `requested` if creation did not
 * finish transitions — advance requested → planned → (awaiting_confirmation | queued) first.
 * @param {import('../prismaClient.js').PrismaClient} prisma
 * @param {string} missionId
 * @param {string} currentStatus
 * @returns {Promise<{ ok: boolean, error?: string, status?: string }>}
 */
async function ensureStoreMissionReadyForRun(prisma, missionId, currentStatus) {
  let status = currentStatus;
  const load = async () =>
    prisma.missionPipeline.findUnique({
      where: { id: missionId },
      select: { status: true, requiresConfirmation: true },
    });

  let row = await load();
  if (!row) return { ok: false, error: 'not_found' };
  status = row.status;

  if (status === 'queued') {
    return { ok: true, status: 'queued' };
  }

  if (status === 'executing') {
    return { ok: true, status: 'executing' };
  }

  if (status === 'requested' && canTransitionMissionPipeline('requested', 'planned')) {
    await prisma.missionPipeline.update({ where: { id: missionId }, data: { status: 'planned' } });
    row = await load();
    if (!row) return { ok: false, error: 'not_found' };
    status = row.status;
  }

  if (status === 'planned') {
    const next = row.requiresConfirmation ? 'awaiting_confirmation' : 'queued';
    if (canTransitionMissionPipeline('planned', next)) {
      await prisma.missionPipeline.update({ where: { id: missionId }, data: { status: next } });
      row = await load();
      if (!row) return { ok: false, error: 'not_found' };
      status = row.status;
    }
  }

  if (status === 'queued') {
    return { ok: true, status: 'queued' };
  }

  if (status === 'awaiting_confirmation') {
    return approveMissionPipeline(missionId);
  }

  return { ok: false, error: 'invalid_state', status };
}

/**
 * @param {object} opts
 * @param {import('../prismaClient.js').PrismaClient} [opts.prisma]
 * @param {object} opts.user
 * @param {string} opts.missionId
 * @param {Record<string, unknown>} [opts.body]
 * @param {string} [opts.auditSource] - auditedPipelineUpdate source for executing transition
 * @returns {Promise<
 *   | { ok: true, missionId: string, jobId: string, generationRunId: string, draftId: string, status: string, mode?: 'checkpoint_pipeline', orchestration?: { stepsRun: number, stoppedReason: string } }
 *   | { ok: false, statusCode: number, error: string, message: string }
 * >}
 */
async function executeStoreMissionPipelineRunCore({
  prisma: prismaIn,
  user,
  missionId,
  body = {},
  auditSource = 'missions_store_run',
} = {}) {
  const prisma = prismaIn ?? getPrismaClient();

  const access = await resolveAccessibleMission(user, missionId);
  if (!access.ok || access.kind !== 'mission_pipeline') {
    return { ok: false, statusCode: 404, error: 'not_found', message: 'Mission pipeline not found or access denied' };
  }

  const mission = await prisma.missionPipeline.findUnique({
    where: { id: missionId },
    select: { id: true, type: true, status: true, runState: true, outputsJson: true, metadataJson: true },
  });
  if (!mission) {
    return { ok: false, statusCode: 404, error: 'not_found', message: 'Mission pipeline not found' };
  }

  if (isMissionPipelineCancelledRow(mission)) {
    return {
      ok: false,
      statusCode: 409,
      error: 'mission_cancelled',
      message: 'Mission was cancelled',
    };
  }

  if (mission.type !== 'store') {
    return {
      ok: false,
      statusCode: 400,
      error: 'unsupported_mission_type',
      message: `POST /run only supports type:store missions. Got: ${mission.type}`,
    };
  }

  // Idempotent re-run: intake may reuse a mission already paused at a checkpoint.
  if (mission.status === 'awaiting_input') {
    const hasStructuredStoreBuild = await prisma.missionPipelineStep.count({
      where: { missionId, toolName: 'structured_store_build' },
    });
    if (hasStructuredStoreBuild > 0) {
      const out =
        mission.outputsJson && typeof mission.outputsJson === 'object' ? mission.outputsJson : {};
      return {
        ok: true,
        missionId,
        jobId: typeof out.jobId === 'string' ? out.jobId : '',
        generationRunId: typeof out.generationRunId === 'string' ? out.generationRunId : '',
        draftId: typeof out.draftId === 'string' ? out.draftId : '',
        status: 'awaiting_input',
        mode: 'checkpoint_pipeline',
        orchestration: { stepsRun: 0, stoppedReason: 'awaiting_checkpoint' },
      };
    }
  }

  const RUNNABLE_STATUSES = ['awaiting_confirmation', 'queued', 'requested', 'executing'];

  if (!RUNNABLE_STATUSES.includes(mission.status)) {
    return {
      ok: false,
      statusCode: 409,
      error: 'invalid_status',
      message: `Mission is ${mission.status}, expected one of: ${RUNNABLE_STATUSES.join(', ')}`,
    };
  }

  const prep = await ensureStoreMissionReadyForRun(prisma, missionId, mission.status);
  if (!prep.ok) {
    return {
      ok: false,
      statusCode: 409,
      error: prep.error || 'prepare_failed',
      message: prep.error || 'Could not prepare mission for run',
      ...(prep.status != null ? { pipelineStatus: prep.status } : {}),
    };
  }

  /**
   * Phase 3: structured store pipeline (checkpoints + structured_store_build + analyze_store).
   * Run runner only while any step is pending; never fall through to legacy orchestra for these missions.
   */
  const hasStructuredStoreBuild = await prisma.missionPipelineStep.count({
    where: { missionId, toolName: 'structured_store_build' },
  });
  const pendingSteps = await prisma.missionPipelineStep.count({
    where: { missionId, status: 'pending' },
  });
  if (hasStructuredStoreBuild > 0) {
    const rawPreloadedStructured = body.preloadedCatalogItems;
    if (rawPreloadedStructured != null) {
      const { sanitizePreloadedCatalogItems } = await import('../../services/draftStore/preloadedCatalogFromItems.js');
      const sanitizedPreloadedStructured = sanitizePreloadedCatalogItems(rawPreloadedStructured);
      if (sanitizedPreloadedStructured?.length) {
        await mergeMissionContext(
          missionId,
          { preloadedCatalogItems: sanitizedPreloadedStructured },
          { prisma },
        ).catch(() => {});
      }
    }
    if (pendingSteps > 0) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(
          `[executeStoreMissionPipelineRun] structured store pipeline: ${pendingSteps} pending step(s), mission=${missionId} — skipping legacy build`,
        );
      }
      const { runMissionUntilBlocked } = await import('../missionPipelineOrchestrator.js');
      const orch = await runMissionUntilBlocked(missionId);
      const mAfter = await prisma.missionPipeline.findUnique({
        where: { id: missionId },
        select: { status: true, runState: true, outputsJson: true },
      });
      const out = mAfter?.outputsJson && typeof mAfter.outputsJson === 'object' ? mAfter.outputsJson : {};
      const orchestration = { stepsRun: orch.stepsRun, stoppedReason: orch.stoppedReason };
      const runEval = evaluateStructuredCheckpointRunResult(orch, mAfter);
      if (!runEval.ok) {
        return {
          ok: false,
          statusCode: runEval.statusCode,
          error: runEval.error,
          message: runEval.message,
          missionId,
          pipelineStatus: mAfter?.status ?? orch.status,
          orchestration,
        };
      }
      return {
        ok: true,
        missionId,
        jobId: typeof out.jobId === 'string' ? out.jobId : '',
        generationRunId: typeof out.generationRunId === 'string' ? out.generationRunId : '',
        draftId: typeof out.draftId === 'string' ? out.draftId : '',
        status: mAfter?.status || orch.status || 'awaiting_input',
        mode: 'checkpoint_pipeline',
        orchestration,
      };
    }
    const mDone = await prisma.missionPipeline.findUnique({
      where: { id: missionId },
      select: { status: true, runState: true, outputsJson: true },
    });
    const outDone = mDone?.outputsJson && typeof mDone.outputsJson === 'object' ? mDone.outputsJson : {};
    const doneStatus = String(mDone?.status ?? '').trim().toLowerCase();
    if (doneStatus === 'queued' || doneStatus === 'awaiting_confirmation' || doneStatus === 'idle') {
      return {
        ok: false,
        statusCode: 409,
        error: 'pipeline_not_started',
        message: 'Store pipeline has no pending steps but mission never left queued state.',
        missionId,
        pipelineStatus: mDone?.status,
        orchestration: { stepsRun: 0, stoppedReason: 'no_pending_steps' },
      };
    }
    return {
      ok: true,
      missionId,
      jobId: typeof outDone.jobId === 'string' ? outDone.jobId : '',
      generationRunId: typeof outDone.generationRunId === 'string' ? outDone.generationRunId : '',
      draftId: typeof outDone.draftId === 'string' ? outDone.draftId : '',
      status: mDone?.status || 'completed',
      mode: 'checkpoint_pipeline',
      orchestration: { stepsRun: 0, stoppedReason: 'no_pending_steps' },
    };
  }

  const businessName = typeof body.businessName === 'string' ? body.businessName.trim() : '';
  const businessType = typeof body.businessType === 'string' ? body.businessType.trim() : '';
  const location = typeof body.location === 'string' ? body.location.trim() : '';
  const bodyIntentRaw = typeof body.intentMode === 'string' ? body.intentMode.trim().toLowerCase() : '';
  const rawUserTextFromBody =
    (typeof body.rawUserText === 'string' && body.rawUserText.trim()) ||
    (typeof body.userMessage === 'string' && body.userMessage.trim()) ||
    '';

  const meta = mission.metadataJson && typeof mission.metadataJson === 'object' ? mission.metadataJson : {};
  const effectiveBusinessName = businessName || (typeof meta.businessName === 'string' ? meta.businessName : '') || '';
  const effectiveBusinessType = businessType || (typeof meta.businessType === 'string' ? meta.businessType : '') || '';
  const effectiveLocation = location || (typeof meta.location === 'string' ? meta.location : '') || '';
  const metaWebsite =
    meta.websiteMode === true ||
    meta.generateWebsite === true ||
    (typeof meta.intentMode === 'string' && meta.intentMode.trim().toLowerCase() === 'website');
  const metaIntent =
    typeof meta.intentMode === 'string' && meta.intentMode.trim()
      ? meta.intentMode.trim().toLowerCase()
      : metaWebsite
        ? 'website'
        : 'store';
  const intentMode = bodyIntentRaw === 'website' || bodyIntentRaw === 'store' ? bodyIntentRaw : metaIntent || 'store';

  const tenantId = getTenantId(user) || user?.id;
  const userId =
    (typeof user?.id === 'string' && user.id.trim()) ||
    (typeof user?.userId === 'string' && user.userId.trim()) ||
    null;
  if (!tenantId || !userId) {
    return { ok: false, statusCode: 401, error: 'unauthorized', message: 'Not authenticated' };
  }

  try {
    const { lockCanonicalLocationForMission } = await import('../location/lockCanonicalLocationForMission.ts');
    await lockCanonicalLocationForMission(
      missionId,
      {
        userPrompt: rawUserTextFromBody || null,
        locationText: effectiveLocation || null,
      },
      {
        missionId,
        inputLocation: effectiveLocation || null,
      },
    );
  } catch (lockErr) {
    console.warn('[executeStoreMissionPipelineRun] canonical location lock skipped:', lockErr?.message || lockErr);
  }

  const { createBuildStoreJob, runBuildStoreJob, newTraceId } =
    await import('../../services/draftStore/orchestraBuildStore.js');
  const { inferCurrencyFromLocationText } = await import('../../services/draftStore/currencyInfer.js');

  const bodyCurrency =
    (typeof body.currency === 'string' && body.currency.trim() && body.currency.trim().toUpperCase()) ||
    (typeof body.currencyCode === 'string' && body.currencyCode.trim() && body.currencyCode.trim().toUpperCase()) ||
    null;
  const currencyCode = bodyCurrency || inferCurrencyFromLocationText(effectiveLocation) || 'AUD';

  const cardbeyTraceId =
    typeof body.cardbeyTraceId === 'string' && body.cardbeyTraceId.trim() ? body.cardbeyTraceId.trim() : null;

  const syntheticRaw = `Create a store for ${effectiveBusinessName || 'my business'}${effectiveLocation ? ` in ${effectiveLocation}` : ''}`.trim();
  const effectiveRawInput = rawUserTextFromBody || syntheticRaw;

  const jobRequest = {
    tenantId,
    userId,
    businessName: effectiveBusinessName,
    businessType: effectiveBusinessType,
    storeType: effectiveBusinessType,
    rawInput: effectiveRawInput,
    storeId: 'temp',
    includeImages: true,
    generationRunId: null,
    ...(effectiveLocation ? { location: effectiveLocation } : {}),
    currencyCode,
    intentMode,
    ...(cardbeyTraceId ? { cardbeyTraceId } : {}),
  };

  const created = await createBuildStoreJob(prisma, {
    ...jobRequest,
    user,
    ...guestDraftOptsForActor(user, userId),
  });
  if (!created?.jobId || !created?.generationRunId || !created?.draftId) {
    return {
      ok: false,
      statusCode: 500,
      error: 'job_creation_failed',
      message: 'Failed to create store build job',
    };
  }

  const outputsExisting = mission.outputsJson && typeof mission.outputsJson === 'object' ? mission.outputsJson : {};
  const dualWrite = isPipelineOutputDualWriteEnabled();
  const orchestrationWrites = buildStoreOrchestrationPipelineWrites({
    existingOutputsJson: outputsExisting,
    existingMetadataJson: mission.metadataJson,
    outputsPatch: {
      jobId: created.jobId,
      generationRunId: created.generationRunId,
      draftId: created.draftId,
      ...(created.createdDraftId ? { createdDraftId: created.createdDraftId } : {}),
    },
    dualWrite,
  });
  const mergedMetadata = (() => {
    const prev =
      mission.metadataJson && typeof mission.metadataJson === 'object' && !Array.isArray(mission.metadataJson)
        ? { ...mission.metadataJson }
        : {};
    const fromOrchestration =
      orchestrationWrites.metadataJson && typeof orchestrationWrites.metadataJson === 'object'
        ? { ...orchestrationWrites.metadataJson }
        : {};
    const out = { ...prev, ...fromOrchestration };
    if (cardbeyTraceId) {
      out.cardbeyTraceId = cardbeyTraceId;
    }
    return out;
  })();
  await auditedPipelineUpdate(prisma, {
    where: { id: missionId },
    data: {
      status: 'executing',
      runState: 'running',
      outputsJson: orchestrationWrites.outputsJson,
      startedAt: new Date(),
      ...(Object.keys(mergedMetadata).length > 0 ? { metadataJson: mergedMetadata } : {}),
    },
    source: auditSource,
    correlationId: missionId,
  });

  const runTraceId = cardbeyTraceId || newTraceId();
  const draftIdForRun = created.createdDraftId || created.draftId;

  const db = getPrismaClient();

  await prisma.orchestratorTask
    .update({
      where: { id: created.jobId },
      data: { missionId },
    })
    .catch(() => {});

  try {
    await getOrCreateMission(missionId, user, { prisma: db });
    console.log('[ReAct] Mission record ensured for pipeline:', missionId);
  } catch (e) {
    console.warn('[executeStoreMissionPipelineRun] getOrCreateMission failed:', e?.message || e);
  }

  console.log('[ReAct] missionId linked (store pipeline run):', missionId, 'task:', created.jobId);

  try {
    const { normalizeMissionOwnershipForUser } = await import('../missionOwnership.js');
    await normalizeMissionOwnershipForUser(prisma, missionId, userId, { user, tenantId });
  } catch (ownErr) {
    console.warn('[executeStoreMissionPipelineRun] mission ownership normalize failed:', ownErr?.message || ownErr);
  }

  const missionRow = await db.mission
    .findUnique({
      where: { id: missionId },
      select: { context: true },
    })
    .catch(() => null);

  const missionContext = missionRow?.context?.agentMemory ?? null;

  const emitContextUpdate = createEmitContextUpdate(missionId, 'orchestra', { prisma: db, mergeMissionContext });

  const stepReporter = createStepReporter(missionId, created.jobId, { prisma: db, mergeMissionPlanStep });

  const rawPreloaded = body.preloadedCatalogItems;
  let sanitizedPreloaded = null;
  if (rawPreloaded != null) {
    const { sanitizePreloadedCatalogItems } = await import('../../services/draftStore/preloadedCatalogFromItems.js');
    sanitizedPreloaded = sanitizePreloadedCatalogItems(rawPreloaded);
    if (sanitizedPreloaded?.length) {
      await mergeMissionContext(missionId, { preloadedCatalogItems: sanitizedPreloaded }, { prisma: db }).catch(
        () => {},
      );
    }
  }

  try {
    const draftRow = await db.draftStore
      .findUnique({ where: { id: draftIdForRun }, select: { input: true } })
      .catch(() => null);
    const prevIn =
      draftRow?.input && typeof draftRow.input === 'object' && !Array.isArray(draftRow.input) ? draftRow.input : {};
    await db.draftStore.update({
      where: { id: draftIdForRun },
      data: {
        input: {
          ...prevIn,
          ...(effectiveLocation ? { location: effectiveLocation } : {}),
          ...(effectiveBusinessName ? { businessName: effectiveBusinessName } : {}),
          ...(effectiveBusinessType ? { businessType: effectiveBusinessType, storeType: effectiveBusinessType } : {}),
          currencyCode,
          ...(intentMode ? { intentMode } : {}),
          prompt: body.rawUserText ?? body.userMessage ?? jobRequest.rawInput ?? '',
          ...(sanitizedPreloaded?.length ? { preloadedCatalogItems: sanitizedPreloaded } : {}),
          ...(cardbeyTraceId ? { cardbeyTraceId } : {}),
        },
      },
    });
  } catch (patchErr) {
    console.warn('[executeStoreMissionPipelineRun] draft.input patch failed:', patchErr?.message || patchErr);
  }

  runBuildStoreJob(prisma, created.jobId, draftIdForRun, created.generationRunId, runTraceId, {
    missionContext,
    emitContextUpdate,
    stepReporter,
    reactMissionId: missionId,
    originSurface: auditSource,
    ...(cardbeyTraceId ? { cardbeyTraceId } : {}),
  });

  setImmediate(async () => {
    const MAX_POLLS = 150;
    let polls = 0;
    while (polls++ < MAX_POLLS) {
      const task = await prisma.orchestratorTask
        .findUnique({
          where: { id: created.jobId },
          select: { status: true, result: true },
        })
        .catch(() => null);
      const st = (task?.status || '').toLowerCase();
      if (st === 'completed') {
        const resultPayload = task?.result && typeof task.result === 'object' ? task.result : {};
        await mirrorOrchestraStatusToPipeline(missionId, 'completed', {
          outputsPatch: { result: resultPayload },
          auditSource: `${auditSource}_poll`,
          correlationId: runTraceId,
        });
        return;
      }
      if (st === 'failed') {
        const resultPayload = task?.result && typeof task.result === 'object' ? task.result : {};
        const msg =
          (typeof resultPayload?.message === 'string' && resultPayload.message) ||
          (typeof resultPayload?.error === 'string' && resultPayload.error) ||
          undefined;
        await mirrorOrchestraStatusToPipeline(missionId, 'failed', {
          outputsPatch: { result: resultPayload },
          auditSource: `${auditSource}_poll`,
          correlationId: runTraceId,
          ...(msg ? { errorMessage: msg } : {}),
        });
        return;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  });

  return {
    ok: true,
    missionId,
    jobId: created.jobId,
    generationRunId: created.generationRunId,
    draftId: created.draftId,
    status: 'executing',
  };
}

/**
 * Wrapped store mission run: always logs create_store start / result / thrown errors.
 *
 * @param {object} opts
 * @param {import('../prismaClient.js').PrismaClient} [opts.prisma]
 * @param {object} opts.user
 * @param {string} opts.missionId
 * @param {Record<string, unknown>} [opts.body]
 * @param {string} [opts.auditSource]
 * @returns {Promise<any>}
 */
export async function executeStoreMissionPipelineRun(opts = {}) {
  const { missionId, body = {}, auditSource } = opts ?? {};
  console.log(
    '[create_store] START payload:',
    JSON.stringify({
      missionId,
      auditSource,
      businessName: body?.businessName,
      location: body?.location,
      intentMode: body?.intentMode,
    }),
  );
  try {
    const result = await executeStoreMissionPipelineRunCore(opts);
    console.log('[create_store] Result:', JSON.stringify(result));
    return result;
  } catch (err) {
    console.error('[create_store] FAILED:', err?.message, err?.stack);
    throw err;
  }
}
