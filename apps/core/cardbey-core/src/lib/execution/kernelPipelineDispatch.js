/**
 * Kernel-backed store pipeline dispatch — maps runtime kernel results to mission run shapes.
 */

import { executeRuntimeAction } from '../runtime/performerRuntime/executeRuntimeAction.js';
import { getTenantId } from '../missionAccess.js';
import { evaluateStructuredCheckpointRunResult, isOrchestratorCheckpointSuccess } from '../storeMission/executeStoreMissionPipelineRun.js';
import { getPrismaClient } from '../prisma.js';
import { emitExecutionNotification, EXECUTION_EVENT_TYPES } from './executionNotificationEmitter.js';

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

/**
 * Generic kernel tool dispatch — all registered tools route through executeRuntimeAction.
 *
 * @param {object} input
 * @param {string} input.toolName
 * @param {string} [input.missionId]
 * @param {string} [input.userId]
 * @param {string} [input.tenantId]
 * @param {string} [input.storeId]
 * @param {string} [input.source]
 * @param {string} [input.auditSource]
 * @param {object} [input.input]
 * @param {object} [input.parameters]
 * @param {object} [input.context]
 * @param {boolean} [input.emitCanonicalEvents]
 */
export async function dispatchToolViaKernel(input = {}) {
  const toolName = pickString(input.toolName);
  const source = pickString(input.source, input.auditSource, 'intake_v2_unified');
  const missionId = pickString(input.missionId, input.context?.missionId);
  const userId = pickString(input.userId, input.context?.userId);
  const tenantId = pickString(input.tenantId, input.context?.tenantId);
  const storeId = pickString(input.storeId, input.context?.storeId);
  const body =
    input.input && typeof input.input === 'object' && !Array.isArray(input.input)
      ? input.input
      : input.parameters && typeof input.parameters === 'object' && !Array.isArray(input.parameters)
        ? input.parameters
        : {};

  if (!toolName) {
    return {
      ok: false,
      status: 'failed',
      error: { code: 'TOOL_REQUIRED', message: 'dispatchToolViaKernel requires toolName' },
      dispatchedVia: 'runtime_kernel',
    };
  }

  const emitCanonical = input.emitCanonicalEvents !== false && Boolean(missionId);
  if (emitCanonical) {
    void emitExecutionNotification(
      EXECUTION_EVENT_TYPES.STEP_STARTED,
      { toolName, source },
      { missionId, source, executionPath: 'kernel_dispatch' },
    );
  }

  const runtimeResult = await executeRuntimeAction({
    actionType: 'dispatch_tool',
    actionId: `tool:${toolName}`,
    missionId: missionId || null,
    userId: userId || null,
    tenantId: tenantId || null,
    storeId: storeId || null,
    source,
    payload: {
      toolName,
      input: body,
      context: {
        missionId,
        userId,
        tenantId,
        storeId,
        source,
        auditSource: input.auditSource ?? source,
        runtimeOwned: true,
        performerRuntimeOwned: true,
        ...(input.context && typeof input.context === 'object' ? input.context : {}),
      },
    },
  });

  const ok = runtimeResult?.status === 'ok' || runtimeResult?.status === 'completed';
  const failed = runtimeResult?.status === 'failed' || runtimeResult?.status === 'blocked';

  if (emitCanonical) {
    void emitExecutionNotification(
      ok ? EXECUTION_EVENT_TYPES.STEP_COMPLETED : EXECUTION_EVENT_TYPES.FAILED,
      {
        toolName,
        output: runtimeResult?.output ?? null,
        error: runtimeResult?.error ?? runtimeResult?.blocker ?? null,
      },
      { missionId, source, executionPath: 'kernel_dispatch' },
    );
  }

  return {
    ok,
    status: runtimeResult?.status ?? (ok ? 'ok' : failed ? 'failed' : 'error'),
    toolName,
    missionId: missionId || null,
    runtimeResult,
    output: runtimeResult?.output ?? null,
    error: runtimeResult?.error ?? null,
    blocker: runtimeResult?.blocker ?? null,
    dispatchedVia: 'runtime_kernel',
  };
}


/**
 * @param {object} runtimeResult
 * @param {string} missionId
 * @param {import('../prisma.js').PrismaClient} [prisma]
 */
export async function mapCreateCampaignRuntimeToRunResult(runtimeResult, missionId, prisma = getPrismaClient()) {
  const mid = pickString(missionId, runtimeResult?.output?.missionId);
  const blocked = runtimeResult?.status === 'blocked';
  const failed = runtimeResult?.status === 'failed' || blocked;

  if (failed) {
    return {
      ok: false,
      statusCode: blocked ? 409 : 500,
      error: runtimeResult?.error?.code ?? runtimeResult?.blocker?.code ?? 'kernel_dispatch_failed',
      message:
        runtimeResult?.error?.message ??
        runtimeResult?.blocker?.message ??
        'Campaign creation failed via runtime kernel',
      missionId: mid,
    };
  }

  const output = runtimeResult?.output && typeof runtimeResult.output === 'object' ? runtimeResult.output : {};
  const outputStatus = pickString(output.status).toLowerCase();
  const outputMode = pickString(output.mode).toLowerCase();

  if (outputMode === 'checkpoint_pipeline' && outputStatus === 'awaiting_input' && mid) {
    return {
      ok: true,
      missionId: mid,
      campaignId: pickString(output.campaignId),
      promotionId: pickString(output.promotionId),
      status: outputStatus,
      mode: 'checkpoint_pipeline',
      orchestration: {
        ok: true,
        status: outputStatus,
        stepsRun: 1,
        stoppedReason: 'awaiting_checkpoint',
      },
      dispatchedVia: 'runtime_kernel',
    };
  }

  const missionRow = mid
    ? await prisma.missionPipeline.findUnique({
        where: { id: mid },
        select: { status: true, runState: true },
      })
    : null;

  const orch = {
    ok: true,
    status: output.status ?? missionRow?.status,
    runState: missionRow?.runState,
    stepsRun: 1,
    stoppedReason: output.status === 'awaiting_input' ? 'awaiting_checkpoint' : undefined,
  };

  const evalResult = evaluateStructuredCheckpointRunResult(orch, missionRow);
  if (!evalResult.ok) {
    return {
      ok: false,
      statusCode: evalResult.statusCode ?? 409,
      error: evalResult.error ?? 'pipeline_run_failed',
      message: evalResult.message ?? 'Campaign pipeline did not reach checkpoint',
      missionId: mid,
    };
  }

  return {
    ok: true,
    missionId: mid,
    campaignId: pickString(output.campaignId),
    promotionId: pickString(output.promotionId),
    status: pickString(output.status, missionRow?.status),
    mode: pickString(output.mode, 'checkpoint_pipeline'),
    orchestration: orch,
    dispatchedVia: 'runtime_kernel',
  };
}

/**
 * @param {object} input
 */
export async function dispatchCreateCampaignViaKernel(input = {}) {
  const missionId = pickString(input.missionId);
  const user = input.user && typeof input.user === 'object' ? input.user : {};
  const body = input.body && typeof input.body === 'object' ? input.body : {};
  const source = pickString(input.source, input.auditSource, 'intake_v2_unified');
  const userId = pickString(user.id, body.userId);
  const tenantId = pickString(getTenantId(user), body.tenantId, userId);
  const storeId = pickString(body.storeId, input.storeId);

  if (!missionId) {
    return {
      ok: false,
      statusCode: 400,
      error: 'MISSION_REQUIRED',
      message: 'dispatchCreateCampaignViaKernel requires missionId',
    };
  }

  const runtimeResult = (
    await dispatchToolViaKernel({
      toolName: 'create_campaign',
      missionId,
      userId: userId || null,
      tenantId: tenantId || null,
      storeId: storeId || null,
      source,
      auditSource: input.auditSource ?? source,
      input: body,
      context: {
        locale: body.locale ?? 'en',
      },
      emitCanonicalEvents: false,
    })
  ).runtimeResult;

  return mapCreateCampaignRuntimeToRunResult(runtimeResult, missionId, input.prisma);
}

/**
 * @param {object} runtimeResult
 * @param {string} missionId
 * @param {import('../prisma.js').PrismaClient} [prisma]
 */
export async function mapCreateStoreRuntimeToRunResult(runtimeResult, missionId, prisma = getPrismaClient()) {
  const mid = pickString(missionId, runtimeResult?.output?.missionId);
  const blocked = runtimeResult?.status === 'blocked';
  const failed = runtimeResult?.status === 'failed' || blocked;

  if (failed) {
    return {
      ok: false,
      statusCode: blocked ? 409 : 500,
      error: runtimeResult?.error?.code ?? runtimeResult?.blocker?.code ?? 'kernel_dispatch_failed',
      message:
        runtimeResult?.error?.message ??
        runtimeResult?.blocker?.message ??
        'Store creation failed via runtime kernel',
      missionId: mid,
    };
  }

  const output = runtimeResult?.output && typeof runtimeResult.output === 'object' ? runtimeResult.output : {};
  const outputStatus = pickString(output.status).toLowerCase();
  const outputMode = pickString(output.mode).toLowerCase();
  const outputOrch =
    output.orchestration && typeof output.orchestration === 'object' ? output.orchestration : null;

  /** Trust runtime tool output when DB read races pipeline checkpoint write. */
  if (outputMode === 'checkpoint_pipeline' && outputStatus === 'awaiting_input' && mid) {
    return {
      ok: true,
      missionId: mid,
      jobId: pickString(output.jobId),
      generationRunId: pickString(output.generationRunId),
      draftId: pickString(output.draftId),
      status: outputStatus,
      mode: 'checkpoint_pipeline',
      orchestration: {
        ok: true,
        status: outputStatus,
        stepsRun: 1,
        stoppedReason: 'awaiting_checkpoint',
      },
      dispatchedVia: 'runtime_kernel',
    };
  }

  if (
    mid &&
    outputOrch &&
    String(outputOrch.stoppedReason ?? '') === 'awaiting_checkpoint'
  ) {
    return {
      ok: true,
      missionId: mid,
      jobId: pickString(output.jobId),
      generationRunId: pickString(output.generationRunId),
      draftId: pickString(output.draftId),
      status: outputStatus || 'awaiting_input',
      mode: 'checkpoint_pipeline',
      orchestration: {
        ok: true,
        status: outputStatus || 'awaiting_input',
        stepsRun: typeof outputOrch.stepsRun === 'number' ? outputOrch.stepsRun : 1,
        stoppedReason: 'awaiting_checkpoint',
      },
      dispatchedVia: 'runtime_kernel',
    };
  }

  let missionRow = null;
  if (mid) {
    try {
      missionRow = await prisma.missionPipeline.findUnique({
        where: { id: mid },
        select: { status: true, runState: true },
      });
    } catch (err) {
      console.warn(
        '[kernelPipelineDispatch] mission read failed after create_store runtime:',
        err?.message ?? err,
      );
    }
  }

  const orch = {
    ok: true,
    status: output.status ?? missionRow?.status,
    runState: missionRow?.runState,
    stepsRun: typeof outputOrch?.stepsRun === 'number' ? outputOrch.stepsRun : 1,
    stoppedReason:
      output.status === 'awaiting_input' || outputOrch?.stoppedReason === 'awaiting_checkpoint'
        ? 'awaiting_checkpoint'
        : outputOrch?.stoppedReason,
  };

  const evalResult = evaluateStructuredCheckpointRunResult(orch, missionRow);
  if (!evalResult.ok) {
    if (isOrchestratorCheckpointSuccess(orch)) {
      return {
        ok: true,
        missionId: mid,
        jobId: pickString(output.jobId),
        generationRunId: pickString(output.generationRunId),
        draftId: pickString(output.draftId),
        status: pickString(output.status, orch.status, 'awaiting_input'),
        mode: pickString(output.mode, 'checkpoint_pipeline'),
        orchestration: orch,
        dispatchedVia: 'runtime_kernel',
      };
    }
    return {
      ok: false,
      statusCode: evalResult.statusCode ?? 409,
      error: evalResult.error ?? 'pipeline_run_failed',
      message: evalResult.message ?? 'Store pipeline did not reach checkpoint',
      missionId: mid,
    };
  }

  return {
    ok: true,
    missionId: mid,
    jobId: pickString(output.jobId),
    generationRunId: pickString(output.generationRunId),
    draftId: pickString(output.draftId),
    status: pickString(output.status, missionRow?.status),
    mode: pickString(output.mode, 'checkpoint_pipeline'),
    orchestration: orch,
    dispatchedVia: 'runtime_kernel',
  };
}

/**
 * @param {object} input
 * @param {string} input.missionId
 * @param {object} [input.user]
 * @param {object} [input.body]
 * @param {string} [input.source]
 * @param {string} [input.auditSource]
 * @param {import('../prisma.js').PrismaClient} [input.prisma]
 */
export async function dispatchCreateStoreViaKernel(input = {}) {
  const missionId = pickString(input.missionId);
  const user = input.user && typeof input.user === 'object' ? input.user : {};
  const body = input.body && typeof input.body === 'object' ? input.body : {};
  const source = pickString(input.source, input.auditSource, 'intake_v2_unified');
  const userId = pickString(user.id, body.userId);
  const tenantId = pickString(getTenantId(user), body.tenantId, userId);

  if (!missionId) {
    return {
      ok: false,
      statusCode: 400,
      error: 'MISSION_REQUIRED',
      message: 'dispatchCreateStoreViaKernel requires missionId',
    };
  }

  const runtimeResult = (
    await dispatchToolViaKernel({
      toolName: 'create_store',
      missionId,
      userId: userId || null,
      tenantId: tenantId || null,
      source,
      auditSource: input.auditSource ?? source,
      input: body,
      emitCanonicalEvents: false,
    })
  ).runtimeResult;

  return mapCreateStoreRuntimeToRunResult(runtimeResult, missionId, input.prisma);
}

/**
 * Advance mission pipeline via runtime kernel (single orchestrator step).
 *
 * @param {string} missionId
 * @param {{ source?: string }} [options]
 */
export async function runPipelineStepViaKernel(missionId, options = {}) {
  const id = pickString(missionId);
  const source = pickString(options.source, 'run_mission_until_blocked');
  if (!id) {
    return { ok: false, error: 'MISSION_REQUIRED', message: 'runPipelineStepViaKernel requires missionId' };
  }

  const fr = await executeRuntimeAction({
    actionType: 'run_pipeline_step',
    actionId: 'pipeline:run_next_step',
    missionId: id,
    source,
  });

  const runResult =
    fr?.output && typeof fr.output === 'object'
      ? fr.output
      : { ok: false, error: fr?.error?.code || 'facade_failed' };

  return {
    facadeStatus: fr?.status ?? 'failed',
    runResult,
    runtimeResult: fr,
  };
}
