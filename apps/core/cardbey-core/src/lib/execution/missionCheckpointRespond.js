/**
 * Mission checkpoint respond + resume — canonical logic for POST /api/execution/:executionId/checkpoint.
 * Legacy HTTP: POST /api/missions/:missionId/respond (deprecated).
 */

import { canTransitionMissionPipeline } from '../missionPipelineTransitions.js';
import { buildRunnerDualWriteMetadataJson } from '../orchestrator/pipelineCanonicalResults.js';
import { runMissionUntilBlocked } from '../missionPipelineOrchestrator.js';
import { runPostMissionCompletionSummary } from '../missionCompletion/postMissionSummary.js';
import { isArtifactCheckpointDeferredRespond } from '../artifactCheckpointAuthority.js';
import { emitExecutionNotification, EXECUTION_EVENT_TYPES } from './executionNotificationEmitter.js';
import { onMissionCheckpointResolved, onMissionCompleted } from '../context/contextMissionHooks.js';

/**
 * @param {import('../prisma.js').PrismaClient} prisma
 * @param {string} missionId
 * @param {string} stepId
 * @param {unknown} response
 * @param {object} [data]
 * @param {{ source?: string }} [options]
 */
export async function respondMissionCheckpointAndResume(
  prisma,
  missionId,
  stepId,
  response,
  data = {},
  options = {},
) {
  const missionIdTrimmed = String(missionId ?? '').trim();
  const stepIdTrimmed = String(stepId ?? '').trim();
  const source = String(options.source ?? 'mission_checkpoint_respond').trim();

  if (!missionIdTrimmed || !stepIdTrimmed) {
    return {
      ok: false,
      statusCode: 400,
      error: 'validation',
      message: 'missionId and stepId are required',
    };
  }

  const pipeline = await prisma.missionPipeline.findUnique({
    where: { id: missionIdTrimmed },
    include: { steps: { orderBy: { orderIndex: 'asc' } } },
  });
  if (!pipeline) {
    return { ok: false, statusCode: 404, error: 'not_found', message: 'Mission not found' };
  }
  if (pipeline.status !== 'awaiting_input') {
    return {
      ok: false,
      statusCode: 409,
      error: 'invalid_state',
      message: 'Mission is not awaiting checkpoint input',
    };
  }

  const step = pipeline.steps.find((s) => s.id === stepIdTrimmed);
  if (!step || step.status !== 'awaiting_input') {
    return {
      ok: false,
      statusCode: 409,
      error: 'step_not_awaiting',
      message: 'Step is not awaiting input',
    };
  }

  const cfg = step.configJson && typeof step.configJson === 'object' ? step.configJson : {};
  const outputKey = typeof cfg.outputKey === 'string' ? cfg.outputKey : 'ownerResponse';

  if (isArtifactCheckpointDeferredRespond(outputKey, response, data)) {
    return {
      ok: false,
      statusCode: 409,
      error: 'artifact_required',
      message: 'Checkpoint requires a successful upload or library selection before continuing.',
    };
  }

  const outPayload = {
    ownerResponse: response,
    [outputKey]: response,
    ...data,
  };
  const prevOutputs =
    pipeline.outputsJson && typeof pipeline.outputsJson === 'object' ? { ...pipeline.outputsJson } : {};
  const mergedOutputs = { ...prevOutputs, [outputKey]: response, ...data };
  const newCompleted = (pipeline.progressCompletedSteps ?? 0) + 1;

  if (!canTransitionMissionPipeline('awaiting_input', 'executing')) {
    return { ok: false, statusCode: 409, error: 'transition_denied', message: 'Transition denied' };
  }

  const dualMeta = await buildRunnerDualWriteMetadataJson(
    prisma,
    missionIdTrimmed,
    pipeline.metadataJson,
    mergedOutputs,
  );

  await prisma.$transaction(async (tx) => {
    await tx.missionPipelineStep.update({
      where: { id: stepIdTrimmed },
      data: {
        status: 'completed',
        completedAt: new Date(),
        outputJson: outPayload,
      },
    });

    await tx.missionPipeline.update({
      where: { id: missionIdTrimmed },
      data: {
        status: 'executing',
        runState: 'running',
        currentStepId: null,
        progressCompletedSteps: newCompleted,
        outputsJson: mergedOutputs,
        ...(dualMeta != null ? { metadataJson: dualMeta } : {}),
      },
    });
  });

  const newStoreName =
    typeof mergedOutputs.storeName === 'string'
      ? mergedOutputs.storeName.trim()
      : typeof mergedOutputs.businessName === 'string'
        ? mergedOutputs.businessName.trim()
        : '';
  if (newStoreName && pipeline.type === 'store') {
    const metaAfter =
      dualMeta && typeof dualMeta === 'object' && !Array.isArray(dualMeta)
        ? dualMeta
        : pipeline.metadataJson && typeof pipeline.metadataJson === 'object' && !Array.isArray(pipeline.metadataJson)
          ? pipeline.metadataJson
          : {};
    const intentModeRaw =
      mergedOutputs.intentMode ??
      mergedOutputs.intentType ??
      metaAfter.intentMode ??
      metaAfter.intentType ??
      null;
    const intentStr = typeof intentModeRaw === 'string' ? intentModeRaw.trim().toLowerCase() : '';
    const metaWebsite =
      metaAfter.websiteMode === true ||
      metaAfter.generateWebsite === true ||
      (typeof metaAfter.intentMode === 'string' && metaAfter.intentMode.trim().toLowerCase() === 'website');
    const prefix = intentStr === 'website' || metaWebsite ? 'Create mini website' : 'Create store';
    await prisma.missionPipeline.update({
      where: { id: missionIdTrimmed },
      data: { title: `${prefix}: ${newStoreName.slice(0, 120)}` },
    });
  }

  await emitExecutionNotification(
    EXECUTION_EVENT_TYPES.CHECKPOINT_RESOLVED,
    {
      stepId: stepIdTrimmed,
      response,
      outputKey,
    },
    { missionId: missionIdTrimmed, source, executionPath: 'kernel_dispatch' },
  );

  void onMissionCheckpointResolved(prisma, missionIdTrimmed, stepIdTrimmed).catch((err) => {
    console.warn('[context] onMissionCheckpointResolved failed:', err?.message ?? err);
  });

  const orchestration = await runMissionUntilBlocked(missionIdTrimmed, { forceExecuting: true });

  const mAfter = await prisma.missionPipeline.findUnique({
    where: { id: missionIdTrimmed },
    include: { steps: true },
  });

  const allStepsDone =
    mAfter &&
    Array.isArray(mAfter.steps) &&
    mAfter.steps.length > 0 &&
    mAfter.steps.every((s) => {
      const st = String(s.status ?? '').toLowerCase();
      return st === 'completed' || st === 'skipped' || st === 'failed';
    });
  const runStateDone = String(mAfter?.runState ?? '').toLowerCase() === 'done';
  const pipelineAlreadyCompleted = mAfter?.status === 'completed' || runStateDone;

  if (allStepsDone && mAfter && (mAfter.status === 'executing' || pipelineAlreadyCompleted)) {
    if (mAfter.status === 'executing') {
      await prisma.missionPipeline.update({
        where: { id: missionIdTrimmed },
        data: { status: 'completed', runState: 'done', completedAt: new Date(), currentStepId: null },
      });
    }

    const fresh = await prisma.missionPipeline.findUnique({
      where: { id: missionIdTrimmed },
      select: {
        id: true,
        type: true,
        status: true,
        runState: true,
        targetId: true,
        targetType: true,
        outputsJson: true,
        metadataJson: true,
      },
    });
    const outputsForSummary =
      fresh?.outputsJson && typeof fresh.outputsJson === 'object' && !Array.isArray(fresh.outputsJson)
        ? fresh.outputsJson
        : {};
    void runPostMissionCompletionSummary({
      missionId: missionIdTrimmed,
      missionType: fresh?.type ?? null,
      metadataJson: fresh?.metadataJson ?? null,
      outputsJson: outputsForSummary,
    }).catch(() => {});

    await emitExecutionNotification(
      EXECUTION_EVENT_TYPES.COMPLETED,
      { missionType: fresh?.type ?? null, outputs: outputsForSummary },
      { missionId: missionIdTrimmed, source, executionPath: 'kernel_dispatch' },
    );

    void onMissionCompleted(
      prisma,
      missionIdTrimmed,
      {
        ...(outputsForSummary && typeof outputsForSummary === 'object' ? outputsForSummary : {}),
        targetId: fresh?.targetId ?? null,
        targetType: fresh?.targetType ?? null,
        type: fresh?.type ?? null,
        metadataJson: fresh?.metadataJson ?? null,
      },
    ).catch((err) => {
      console.warn('[context] onMissionCompleted failed:', err?.message ?? err);
    });
  }

  return {
    ok: true,
    statusCode: 200,
    missionId: missionIdTrimmed,
    stepId: stepIdTrimmed,
    orchestration,
    missionStatus: mAfter?.status ?? null,
    executionPath: 'kernel_dispatch',
  };
}
