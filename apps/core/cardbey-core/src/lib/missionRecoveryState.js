/**
 * GET /api/missions/:missionId/recovery-state — store / website mission recovery snapshot.
 * Used by Performer Console when a pipeline is terminal (failed or completed) to decide
 * review CTAs, draft ids, and whether the UI should show "Needs attention".
 */

import { getPrismaClient } from './prisma.js';
import { resolveMissionState } from './missionPipelineResolver.js';

const TERMINAL_STEP = new Set(['completed', 'skipped', 'failed', 'blocked']);

function asObject(val) {
  if (val == null) return {};
  if (typeof val === 'object' && !Array.isArray(val)) return val;
  return {};
}

function pickStr(...candidates) {
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return null;
}

function allPipelineStepsComplete(steps) {
  if (!Array.isArray(steps) || steps.length === 0) return false;
  return steps.every((s) => TERMINAL_STEP.has(String(s?.status ?? '').toLowerCase()));
}

function pipelineSucceeded(status, runState) {
  const st = String(status ?? '').toLowerCase();
  const rs = String(runState ?? '').toLowerCase();
  if (st === 'completed' || rs === 'done') return true;
  return false;
}

function pipelineHardFailed(status, runState) {
  const st = String(status ?? '').toLowerCase();
  const rs = String(runState ?? '').toLowerCase();
  if (st.includes('fail') || st === 'cancelled') return true;
  if (rs === 'failed' || rs === 'cancelled') return true;
  // Stale runState=error after a completed pipeline should not count as hard failure.
  if (rs === 'error' && st !== 'completed') return true;
  return false;
}

function readReactValidation(metadataJson, missionContext) {
  const meta = asObject(metadataJson);
  const ctx =
    missionContext && typeof missionContext === 'object' && !Array.isArray(missionContext)
      ? missionContext
      : {};
  const rv = meta.react_validation ?? ctx.react_validation;
  if (!rv || typeof rv !== 'object' || Array.isArray(rv)) return null;
  return rv;
}

/**
 * @param {string} missionId
 * @returns {Promise<object|null>}
 */
export async function resolveMissionRecoveryState(missionId) {
  const id = typeof missionId === 'string' ? missionId.trim() : '';
  if (!id) return null;

  const prisma = getPrismaClient();
  const pipeline = await prisma.missionPipeline.findUnique({
    where: { id },
    include: { steps: { orderBy: { orderIndex: 'asc' } } },
  });
  if (!pipeline) return null;

  const state = await resolveMissionState(id);
  const outputs = asObject(pipeline.outputsJson);
  const metadata = asObject(pipeline.metadataJson);

  const draftId = pickStr(
    outputs.draftId,
    outputs.createdDraftId,
    metadata.draftId,
    state?.outputs?.draftId,
  );
  const generationRunId = pickStr(
    outputs.generationRunId,
    outputs.jobId,
    metadata.generationRunId,
    state?.outputs?.generationRunId,
  );
  const storeId = pickStr(
    pipeline.targetId,
    outputs.storeId,
    outputs.createdStoreId,
    state?.target?.id,
  );

  let draftStatus = null;
  let storeDraftReviewReady = false;
  if (draftId) {
    const draft = await prisma.draftStore.findUnique({
      where: { id: draftId },
      select: { status: true },
    });
    draftStatus = draft?.status ?? null;
    storeDraftReviewReady = String(draftStatus ?? '').toLowerCase() === 'ready';
  } else if (generationRunId) {
    const draft = await prisma.draftStore.findFirst({
      where: { generationRunId },
      select: { id: true, status: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (draft) {
      draftStatus = draft.status;
      storeDraftReviewReady = String(draft.status ?? '').toLowerCase() === 'ready';
    }
  }

  const stepsComplete = allPipelineStepsComplete(pipeline.steps);
  const outputValidationEnabled = process.env.USE_OUTPUT_VALIDATION === 'true';
  const reactValidation = readReactValidation(metadata, null);
  const validationFailed =
    outputValidationEnabled &&
    reactValidation &&
    reactValidation.valid === false;

  const succeeded = pipelineSucceeded(pipeline.status, pipeline.runState);
  const hardFailed = pipelineHardFailed(pipeline.status, pipeline.runState);

  let workflowState = 'in_progress';
  let needsAttention = false;
  let reason = null;

  if (succeeded && stepsComplete && !validationFailed) {
    workflowState = storeDraftReviewReady || !draftId ? 'ready' : 'ready_pending_draft';
    needsAttention = false;
    reason = outputValidationEnabled
      ? 'pipeline_completed'
      : 'pipeline_completed_validation_skipped';
  } else if (stepsComplete && !outputValidationEnabled && !hardFailed) {
    // All steps done, validation off — treat as success even if status/runState drifted.
    workflowState = storeDraftReviewReady || !draftId ? 'ready' : 'ready_pending_draft';
    needsAttention = false;
    reason = 'all_steps_complete_validation_off';
  } else if (validationFailed) {
    workflowState = 'needs_attention';
    needsAttention = true;
    reason = 'output_validation_failed';
  } else if (hardFailed) {
    workflowState = 'failed';
    needsAttention = true;
    reason = pickStr(metadata.orchestraMirrorError, outputs?.result?.message) ?? 'pipeline_failed';
  } else if (stepsComplete) {
    workflowState = 'needs_attention';
    needsAttention = true;
    reason = 'steps_complete_pipeline_not_terminal';
  } else {
    workflowState = 'in_progress';
    needsAttention = false;
    reason = 'pipeline_running';
  }

  const ctas = [];
  if (needsAttention && hardFailed) {
    ctas.push({ action: 'retry', label: 'Retry mission' });
  }
  if (storeDraftReviewReady && draftId) {
    ctas.push({ action: 'review_draft', label: 'Review draft', draftId, generationRunId });
  }
  if (storeId) {
    ctas.push({ action: 'open_store', label: 'Open store', storeId });
  }

  return {
    missionId: id,
    missionType: pipeline.type,
    workflowState,
    needsAttention,
    reason,
    outputValidationEnabled,
    outputValidationSkipped: !outputValidationEnabled,
    allStepsComplete: stepsComplete,
    storeDraftReviewReady,
    draftId,
    generationRunId,
    storeDraftId: draftId,
    storeId,
    draftStatus,
    pipelineStatus: pipeline.status,
    pipelineRunState: pipeline.runState,
    ctas,
  };
}
