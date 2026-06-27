/**
 * Runtime Mission Orchestrator — authoritative proactive step sequencing (Phase B).
 * Delegates execution to performerRuntimeKernel.executeMissionStep; never dispatches tools directly.
 */

import { randomUUID } from 'node:crypto';
import { appendEvent } from '../missionBlackboard.js';
import { getPrismaClient } from '../prisma.js';
import { executeMissionStep, isRuntimeStepExecutionEnabled } from './performerRuntimeKernel.js';
import {
  assertProactivePipelineOrMissionAccess,
} from './proactiveRunwayStepExecutor.js';
import {
  getProactiveStepStatus,
  hydrateCompletedStepNumbers,
  readProactiveStepStatusMap,
} from './runtimeStepState.js';
import { getRuntimeCapabilities, requireRuntimeCapability } from './runtimeCapabilitiesService.js';
import {
  resolveTargetReadiness,
  resolveTargetIdsFromMission,
  STORE_READINESS,
} from './runtimeTargetReadinessService.js';
import { isRuntimeTargetReadinessEnabled } from './runtimeSessionService.js';
import { ORCHESTRATION_STATUS, resolveMissionOrchestrationStatus } from './runtimeMissionStatus.js';
import {
  ensureProactivePlanInMetadata,
  mergeOrchestrationState,
  mergeProactivePlanBundleIntoMetadata,
  readOrchestrationState,
  readProactivePlanSteps,
} from './runtimeOrchestrationState.js';
import {
  runGraphNextStep,
  runGraphStepsLoop,
  isRuntimeGraphOrchestrationEnabled,
} from './runtimeMissionGraphOrchestrator.js';

export function isRuntimeMissionOrchestratorEnabled() {
  return getRuntimeCapabilities().runtimeMissionOrchestrator === true;
}

function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

async function emitOrchestrationEvent(missionId, eventType, payload, traceId) {
  try {
    await appendEvent(missionId, eventType, payload, traceId ? { traceId } : {});
  } catch (e) {
    console.warn(`[RuntimeOrchestrator] ${eventType} emit failed:`, e?.message || e);
  }
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} missionId
 * @param {object} metadataPatch
 */
async function persistMissionMetadata(prisma, missionId, metadataPatch) {
  await prisma.missionPipeline.update({
    where: { id: missionId },
    data: { metadataJson: metadataPatch },
  });
}

/**
 * @param {object} missionRow
 * @param {Array<object>} planSteps
 * @param {{ forceStepNumber?: number|null; forceRetry?: boolean }} opts
 */
function selectNextExecutableStep(missionRow, planSteps, opts = {}) {
  const meta = missionRow.metadataJson ?? {};
  const forceStep = Math.floor(Number(opts.forceStepNumber));
  if (Number.isFinite(forceStep) && forceStep >= 1) {
    const forced = planSteps.find((s) => s.step === forceStep);
    if (!forced) return null;
    const st = getProactiveStepStatus(meta, forceStep);
    if (st === 'completed' && !opts.forceRetry) return null;
    if (st === 'running' && !opts.forceRetry) return { ...forced, alreadyRunning: true };
    return forced;
  }

  for (const step of planSteps) {
    const st = getProactiveStepStatus(meta, step.step);
    if (st === 'completed' || st === 'skipped') continue;
    if (st === 'running') return { ...step, alreadyRunning: true };
    if (st === 'failed' || st === 'rejected') {
      if (opts.forceRetry) return step;
      return { ...step, blockedByFailure: true };
    }
    return step;
  }
  return null;
}

/**
 * @param {object} missionRow
 * @param {object} step
 */
async function checkTargetReadinessBlock(user, missionRow, step) {
  if (!isRuntimeTargetReadinessEnabled()) return null;

  const tool = str(step.recommendedTool).toLowerCase();
  const campaignTools = new Set(['create_promotion', 'launch_campaign', 'campaign_research']);
  if (!campaignTools.has(tool) && tool !== 'analyze_store') return null;

  const userId = str(user?.id);
  const ids = resolveTargetIdsFromMission(missionRow);
  const readiness = await resolveTargetReadiness({
    userId,
    targetType: missionRow.targetType ?? 'store',
    targetId: missionRow.targetId ?? ids.storeId,
    mission: missionRow,
  });

  const blockingIssues = Array.isArray(readiness.blockingIssues) ? readiness.blockingIssues : [];
  const ops = readiness.operationalCapabilities ?? {};

  if (campaignTools.has(tool) && ops.canCampaign === false) {
    const state = str(readiness.readinessState);
    if (
      state === STORE_READINESS.MISSING ||
      state === STORE_READINESS.DRAFT_CREATED ||
      blockingIssues.length > 0
    ) {
      return {
        code: 'READINESS_BLOCKED',
        blockingReason: 'target_not_ready',
        readinessState: state,
        blockingIssues,
        recommendedActions: readiness.recommendedActions ?? [],
        guidanceMessage: readiness.guidanceMessage ?? null,
      };
    }
  }

  return null;
}

/**
 * @param {object} input
 */
function buildOrchestratorBaseInput(input) {
  const req = input && typeof input === 'object' ? input : {};
  return {
    user: req.user,
    missionId: str(req.missionId),
    source: str(req.source) || 'runtime_orchestrator',
    traceId: typeof req.traceId === 'string' ? req.traceId.trim() : null,
    requestId: typeof req.requestId === 'string' ? req.requestId.trim() : randomUUID(),
    planSteps: Array.isArray(req.planSteps) ? req.planSteps : null,
    planParameters:
      req.planParameters && typeof req.planParameters === 'object' && !Array.isArray(req.planParameters)
        ? req.planParameters
        : null,
    stepNumber: Number.isFinite(Number(req.stepNumber)) ? Math.floor(Number(req.stepNumber)) : null,
    forceRetry: req.forceRetry === true,
    stopOnBlock: req.stopOnBlock !== false,
    maxSteps: Math.max(1, Math.min(50, Math.floor(Number(req.maxSteps) || 50))),
  };
}

/**
 * @param {object} ctx
 */
async function loadMissionForOrchestration(ctx) {
  const gate = requireRuntimeCapability('runtimeMissionOrchestrator', {
    source: ctx.source,
    missionId: ctx.missionId,
  });
  if (!gate.ok) {
    return { ok: false, httpStatus: 503, code: gate.code, message: gate.message, capability: gate.capability };
  }
  if (!isRuntimeMissionOrchestratorEnabled() || !isRuntimeStepExecutionEnabled()) {
    return {
      ok: false,
      httpStatus: 503,
      code: 'RUNTIME_CAPABILITY_UNAVAILABLE',
      message: gate.message,
    };
  }

  const access = await assertProactivePipelineOrMissionAccess(ctx.user, ctx.missionId);
  if (!access.ok) {
    return {
      ok: false,
      httpStatus: access.reason === 'NOT_FOUND' ? 404 : 403,
      code: access.reason ?? 'FORBIDDEN',
      message: 'Mission pipeline not found or access denied',
    };
  }

  const prisma = getPrismaClient();
  const row = await prisma.missionPipeline.findUnique({
    where: { id: ctx.missionId },
  });
  if (!row) {
    return { ok: false, httpStatus: 404, code: 'NOT_FOUND', message: 'Mission not found' };
  }

  let meta = row.metadataJson && typeof row.metadataJson === 'object' ? { ...row.metadataJson } : {};
  if (ctx.planSteps?.length || ctx.planParameters) {
    meta = mergeProactivePlanBundleIntoMetadata(meta, {
      ...(ctx.planSteps?.length ? { planSteps: ctx.planSteps } : {}),
      ...(ctx.planParameters ? { planParameters: ctx.planParameters } : {}),
    });
    if (meta !== row.metadataJson) {
      await persistMissionMetadata(prisma, ctx.missionId, meta);
      row.metadataJson = meta;
    }
  }

  const planSteps = readProactivePlanSteps(meta);
  if (planSteps.length === 0) {
    return {
      ok: false,
      httpStatus: 422,
      code: 'NO_PROACTIVE_PLAN',
      message: 'No proactive plan steps found on mission',
    };
  }

  const orch = readOrchestrationState(meta);
  const orchestrationStatus = resolveMissionOrchestrationStatus(row);
  if (
    orch.status === ORCHESTRATION_STATUS.RUNNING &&
    orch.activeStepNumber != null &&
    getProactiveStepStatus(meta, orch.activeStepNumber) === 'running'
  ) {
    return {
      ok: false,
      httpStatus: 409,
      code: 'ALREADY_RUNNING',
      message: 'A proactive step is already running',
      orchestrationStatus,
      activeStepNumber: orch.activeStepNumber,
      completedStepNumbers: hydrateCompletedStepNumbers(meta),
    };
  }

  return { ok: true, prisma, row, meta, planSteps, orchestrationStatus, orch };
}

/**
 * @param {object} args
 */
async function executeSelectedStep(args) {
  const {
    ctx,
    prisma,
    missionId,
    row,
    meta,
    planSteps,
    step,
    runId,
  } = args;

  const stepNumber = step.step;
  const tool = str(step.recommendedTool);
  if (!tool) {
    return {
      ok: false,
      httpStatus: 422,
      code: 'INVALID_STEP',
      message: `Step ${stepNumber} has no recommendedTool`,
      stepNumber,
    };
  }

  const readinessBlock = await checkTargetReadinessBlock(ctx.user, row, step);
  if (readinessBlock) {
    const nextMeta = mergeOrchestrationState(meta, {
      status: ORCHESTRATION_STATUS.BLOCKED,
      activeStepNumber: stepNumber,
      lastBlockedReason: readinessBlock.blockingReason,
      lastOrchestratorRunId: runId,
    });
    await persistMissionMetadata(prisma, missionId, nextMeta);

    await emitOrchestrationEvent(
      missionId,
      'mission.orchestration.blocked',
      {
        stepNumber,
        code: readinessBlock.code,
        blockingReason: readinessBlock.blockingReason,
        source: ctx.source,
        requestId: ctx.requestId,
      },
      ctx.traceId,
    );
    await emitOrchestrationEvent(
      missionId,
      'runtime.step.blocked',
      { stepNumber, requestedTool: tool, ...readinessBlock, source: ctx.source },
      ctx.traceId,
    );

    return {
      ok: false,
      httpStatus: 412,
      code: readinessBlock.code,
      orchestrationStatus: ORCHESTRATION_STATUS.BLOCKED,
      stepNumber,
      blocked: true,
      lastBlockedReason: readinessBlock.blockingReason,
      readinessBlock,
      completedStepNumbers: hydrateCompletedStepNumbers(nextMeta),
      orchestrationState: readOrchestrationState(nextMeta),
    };
  }

  const planParams = meta.planParameters && typeof meta.planParameters === 'object' ? meta.planParameters : {};
  const stepParams = step.parameters && typeof step.parameters === 'object' ? step.parameters : {};
  const parameters = { ...planParams, ...stepParams };

  let runningMeta = mergeOrchestrationState(meta, {
    status: ORCHESTRATION_STATUS.RUNNING,
    activeStepNumber: stepNumber,
    lastOrchestratorRunId: runId,
  });
  await persistMissionMetadata(prisma, missionId, runningMeta);

  await emitOrchestrationEvent(
    missionId,
    'mission.orchestration.step.selected',
    { stepNumber, requestedTool: tool, source: ctx.source, requestId: ctx.requestId },
    ctx.traceId,
  );
  await emitOrchestrationEvent(
    missionId,
    'runtime.step.running',
    { stepNumber, requestedTool: tool, source: ctx.source },
    ctx.traceId,
  );

  const stepResult = await executeMissionStep({
    user: ctx.user,
    missionId,
    stepNumber,
    requestedTool: tool,
    source: ctx.source,
    traceId: ctx.traceId,
    requestId: ctx.requestId,
    parameters,
    proactivePlanTotal: planSteps.length,
    forceRetry: ctx.forceRetry,
    body: {
      proactivePlanStep: { step: stepNumber, title: step.title },
      parameters,
    },
  });

  if (!stepResult || typeof stepResult !== 'object') {
    return {
      ok: false,
      httpStatus: 500,
      code: 'STEP_EXECUTION_EMPTY',
      message: 'Step execution returned no result',
      stepNumber,
    };
  }

  const refreshed = await prisma.missionPipeline.findUnique({
    where: { id: missionId },
    select: { metadataJson: true, status: true, runState: true },
  });
  const freshMeta = refreshed?.metadataJson ?? runningMeta;

  /** @type {object} */
  const executed = {
    stepNumber,
    requestedTool: tool,
    stepStatus: stepResult.stepStatus ?? (stepResult.ok ? 'completed' : 'failed'),
    ok: stepResult.ok === true,
    alreadyCompleted: stepResult.alreadyCompleted === true,
    code: stepResult.code ?? null,
  };

  if (stepResult.prerequisiteBlocked || stepResult.code === 'PREREQUISITE_REQUIRED') {
    const blockedMeta = mergeOrchestrationState(freshMeta, {
      status: ORCHESTRATION_STATUS.WAITING_FOR_PREREQUISITE,
      activeStepNumber: stepNumber,
      lastBlockedReason: stepResult.blockingReason ?? 'prerequisite_required',
      lastOrchestratorRunId: runId,
    });
    await persistMissionMetadata(prisma, missionId, blockedMeta);

    await emitOrchestrationEvent(
      missionId,
      'mission.orchestration.blocked',
      {
        stepNumber,
        code: 'PREREQUISITE_REQUIRED',
        blockingReason: stepResult.blockingReason,
        source: ctx.source,
      },
      ctx.traceId,
    );
    await emitOrchestrationEvent(
      missionId,
      'runtime.step.blocked',
      { stepNumber, requestedTool: tool, prerequisiteBlocked: true },
      ctx.traceId,
    );

    return {
      ok: false,
      httpStatus: stepResult.httpStatus ?? 412,
      code: 'PREREQUISITE_REQUIRED',
      orchestrationStatus: ORCHESTRATION_STATUS.WAITING_FOR_PREREQUISITE,
      blocked: true,
      stepNumber,
      lastBlockedReason: stepResult.blockingReason ?? 'prerequisite_required',
      stepResult,
      stepsExecuted: [executed],
      completedStepNumbers: hydrateCompletedStepNumbers(blockedMeta),
      orchestrationState: readOrchestrationState(blockedMeta),
      runtimeGuidance: stepResult.runtimeGuidance ?? [],
    };
  }

  const output = stepResult.output && typeof stepResult.output === 'object' ? stepResult.output : {};
  const awaitingDecision =
    (tool === 'create_promotion' && output.phase === 'awaiting_product_selection') ||
    (tool === 'launch_campaign' && output.phase === 'awaiting_channel_selection') ||
    (tool === 'code_fix' && output.phase === 'awaiting_approval') ||
    ((tool === 'create_promotion_graphic' || tool === 'smart_visual') &&
      output.phase === 'awaiting_promo_image');

  if (awaitingDecision) {
    const waitMeta = mergeOrchestrationState(freshMeta, {
      status: ORCHESTRATION_STATUS.WAITING_FOR_DECISION,
      activeStepNumber: stepNumber,
      lastBlockedReason: 'user_decision_required',
      lastOrchestratorRunId: runId,
    });
    await persistMissionMetadata(prisma, missionId, waitMeta);

    await emitOrchestrationEvent(
      missionId,
      'mission.orchestration.blocked',
      { stepNumber, code: 'USER_DECISION_REQUIRED', source: ctx.source },
      ctx.traceId,
    );

    return {
      ok: true,
      httpStatus: 200,
      code: 'USER_DECISION_REQUIRED',
      orchestrationStatus: ORCHESTRATION_STATUS.WAITING_FOR_DECISION,
      blocked: true,
      stepNumber,
      lastBlockedReason: 'user_decision_required',
      stepResult,
      stepsExecuted: [executed],
      completedStepNumbers: hydrateCompletedStepNumbers(waitMeta),
      orchestrationState: readOrchestrationState(waitMeta),
    };
  }

  if (!stepResult.ok && !stepResult.alreadyCompleted) {
    const failMeta = mergeOrchestrationState(freshMeta, {
      status: ORCHESTRATION_STATUS.FAILED,
      activeStepNumber: stepNumber,
      lastBlockedReason: stepResult.message ?? stepResult.code ?? 'step_failed',
      lastOrchestratorRunId: runId,
    });
    await persistMissionMetadata(prisma, missionId, failMeta);

    await emitOrchestrationEvent(
      missionId,
      'mission.orchestration.failed',
      { stepNumber, code: stepResult.code, message: stepResult.message, source: ctx.source },
      ctx.traceId,
    );
    await emitOrchestrationEvent(
      missionId,
      'runtime.step.failed',
      { stepNumber, requestedTool: tool, code: stepResult.code },
      ctx.traceId,
    );

    return {
      ok: false,
      httpStatus: stepResult.httpStatus ?? 500,
      code: stepResult.code ?? 'STEP_FAILED',
      message: stepResult.message ?? stepResult.lastBlockedReason ?? 'Proactive step failed',
      orchestrationStatus: ORCHESTRATION_STATUS.FAILED,
      stepNumber,
      lastBlockedReason: failMeta.orchestrationState?.lastBlockedReason ?? null,
      stepResult,
      stepsExecuted: [executed],
      completedStepNumbers: hydrateCompletedStepNumbers(failMeta),
      orchestrationState: readOrchestrationState(failMeta),
    };
  }

  await emitOrchestrationEvent(
    missionId,
    'runtime.step.completed',
    { stepNumber, requestedTool: tool, alreadyCompleted: stepResult.alreadyCompleted === true },
    ctx.traceId,
  );

  const completed = hydrateCompletedStepNumbers(freshMeta);
  const allDone = planSteps.every((s) => completed.includes(s.step));
  const nextMeta = mergeOrchestrationState(freshMeta, {
    status: allDone ? ORCHESTRATION_STATUS.COMPLETED : ORCHESTRATION_STATUS.IDLE,
    activeStepNumber: allDone ? null : stepNumber,
    lastBlockedReason: null,
    lastOrchestratorRunId: runId,
  });
  await persistMissionMetadata(prisma, missionId, nextMeta);

  if (allDone) {
    await emitOrchestrationEvent(
      missionId,
      'mission.orchestration.completed',
      { totalSteps: planSteps.length, source: ctx.source },
      ctx.traceId,
    );
    await emitOrchestrationEvent(
      missionId,
      'runtime.orchestration.completed',
      { totalSteps: planSteps.length },
      ctx.traceId,
    );
  }

  return {
    ok: true,
    httpStatus: 200,
    code: allDone ? 'ORCHESTRATION_COMPLETED' : 'STEP_COMPLETED',
    orchestrationStatus: allDone ? ORCHESTRATION_STATUS.COMPLETED : ORCHESTRATION_STATUS.IDLE,
    stepNumber,
    stepResult,
    stepsExecuted: [executed],
    completedStepNumbers: hydrateCompletedStepNumbers(nextMeta),
    orchestrationState: readOrchestrationState(nextMeta),
    allStepsComplete: allDone,
  };
}

/**
 * Execute exactly one proactive step (next pending or forced step).
 * @param {object} input
 */
export async function runNextStep(input) {
  const ctx = buildOrchestratorBaseInput(input);
  if (!ctx.missionId) {
    return { ok: false, httpStatus: 400, code: 'INVALID_REQUEST', message: 'missionId is required' };
  }

  const loaded = await loadMissionForOrchestration(ctx);
  if (!loaded.ok) return loaded;

  if (isRuntimeGraphOrchestrationEnabled()) {
    return runGraphNextStep(ctx, loaded);
  }

  const { prisma, row, meta, planSteps } = loaded;
  const runId = randomUUID();

  await emitOrchestrationEvent(
    ctx.missionId,
    'mission.orchestration.started',
    { mode: 'run_next', source: ctx.source, requestId: ctx.requestId },
    ctx.traceId,
  );
  await emitOrchestrationEvent(
    ctx.missionId,
    'runtime.orchestration.started',
    { mode: 'run_next', source: ctx.source },
    ctx.traceId,
  );

  const selected = selectNextExecutableStep(row, planSteps, {
    forceStepNumber: ctx.stepNumber,
    forceRetry: ctx.forceRetry,
  });

  if (!selected) {
    const completed = hydrateCompletedStepNumbers(meta);
    const allDone = planSteps.length > 0 && planSteps.every((s) => completed.includes(s.step));
    return {
      ok: true,
      httpStatus: 200,
      code: allDone ? 'ORCHESTRATION_COMPLETED' : 'NO_PENDING_STEPS',
      orchestrationStatus: allDone ? ORCHESTRATION_STATUS.COMPLETED : ORCHESTRATION_STATUS.IDLE,
      message: allDone ? 'All proactive steps are complete' : 'No pending proactive steps',
      completedStepNumbers: completed,
      orchestrationState: readOrchestrationState(meta),
      stepsExecuted: [],
    };
  }

  if (selected.alreadyRunning) {
    return {
      ok: false,
      httpStatus: 409,
      code: 'ALREADY_RUNNING',
      message: `Step ${selected.step} is already running`,
      stepNumber: selected.step,
      orchestrationStatus: ORCHESTRATION_STATUS.RUNNING,
      completedStepNumbers: hydrateCompletedStepNumbers(meta),
    };
  }

  if (selected.blockedByFailure && !ctx.forceRetry) {
    return {
      ok: false,
      httpStatus: 409,
      code: 'STEP_FAILED',
      message: `Step ${selected.step} failed; retry with forceRetry`,
      stepNumber: selected.step,
      orchestrationStatus: ORCHESTRATION_STATUS.FAILED,
      lastBlockedReason: 'step_failed',
      completedStepNumbers: hydrateCompletedStepNumbers(meta),
    };
  }

  return executeSelectedStep({
    ctx,
    prisma,
    missionId: ctx.missionId,
    row,
    meta,
    planSteps,
    step: selected,
    runId,
  });
}

/**
 * Run steps until blocked, failed, or all complete.
 * @param {object} input
 * @param {{ singleStep?: boolean }} mode
 */
async function runStepsLoop(input, mode = {}) {
  const ctx = buildOrchestratorBaseInput(input);
  if (!ctx.missionId) {
    return { ok: false, httpStatus: 400, code: 'INVALID_REQUEST', message: 'missionId is required' };
  }

  const loaded = await loadMissionForOrchestration(ctx);
  if (!loaded.ok) return loaded;

  if (isRuntimeGraphOrchestrationEnabled()) {
    return runGraphStepsLoop(ctx, loaded, mode);
  }

  const runId = randomUUID();
  await emitOrchestrationEvent(
    ctx.missionId,
    'mission.orchestration.started',
    { mode: mode.singleStep ? 'run_next' : 'run_all', source: ctx.source, requestId: ctx.requestId },
    ctx.traceId,
  );
  await emitOrchestrationEvent(
    ctx.missionId,
    'runtime.orchestration.started',
    { mode: mode.singleStep ? 'run_next' : 'run_all', source: ctx.source },
    ctx.traceId,
  );

  /** @type {object[]} */
  const stepsExecuted = [];
  let lastResult = null;
  let iterations = 0;

  while (iterations < ctx.maxSteps) {
    iterations += 1;

    const freshRow = await loaded.prisma.missionPipeline.findUnique({ where: { id: ctx.missionId } });
    if (!freshRow) break;
    const freshMeta = freshRow.metadataJson ?? {};
    const planSteps = readProactivePlanSteps(freshMeta);

    const selected = selectNextExecutableStep(freshRow, planSteps, {
      forceStepNumber: iterations === 1 ? ctx.stepNumber : null,
      forceRetry: ctx.forceRetry && iterations === 1,
    });

    if (!selected) {
      const completed = hydrateCompletedStepNumbers(freshMeta);
      const allDone = planSteps.every((s) => completed.includes(s.step));
      return {
        ok: true,
        httpStatus: 200,
        code: allDone ? 'ORCHESTRATION_COMPLETED' : 'NO_PENDING_STEPS',
        orchestrationStatus: allDone ? ORCHESTRATION_STATUS.COMPLETED : ORCHESTRATION_STATUS.IDLE,
        stepsExecuted,
        completedStepNumbers: completed,
        orchestrationState: readOrchestrationState(freshMeta),
        allStepsComplete: allDone,
        iterations,
      };
    }

    if (selected.alreadyRunning) {
      return {
        ok: false,
        httpStatus: 409,
        code: 'ALREADY_RUNNING',
        message: `Step ${selected.step} is already running`,
        stepsExecuted,
        stepNumber: selected.step,
        orchestrationStatus: ORCHESTRATION_STATUS.RUNNING,
      };
    }

    if (selected.blockedByFailure && !ctx.forceRetry) {
      return {
        ok: false,
        httpStatus: 409,
        code: 'STEP_FAILED',
        message: `Step ${selected.step} failed; retry with forceRetry`,
        stepsExecuted,
        stepNumber: selected.step,
        orchestrationStatus: ORCHESTRATION_STATUS.FAILED,
      };
    }

    lastResult = await executeSelectedStep({
      ctx,
      prisma: loaded.prisma,
      missionId: ctx.missionId,
      row: freshRow,
      meta: freshMeta,
      planSteps,
      step: selected,
      runId,
    });

    if (Array.isArray(lastResult.stepsExecuted)) {
      stepsExecuted.push(...lastResult.stepsExecuted);
    }

    if (mode.singleStep) {
      return { ...lastResult, stepsExecuted, iterations: 1 };
    }

    if (lastResult.blocked || !lastResult.ok) {
      return { ...lastResult, stepsExecuted, iterations };
    }

    if (lastResult.allStepsComplete) {
      return { ...lastResult, stepsExecuted, iterations };
    }
  }

  return (
    lastResult ?? {
      ok: false,
      httpStatus: 500,
      code: 'ORCHESTRATION_ITERATION_LIMIT',
      message: 'Orchestrator iteration limit reached',
      stepsExecuted,
    }
  );
}

/** Run all available steps until block/fail/complete. */
export async function runAllAvailableSteps(input) {
  return runStepsLoop({ ...input, stopOnBlock: false }, { singleStep: false });
}

/** Run until first block (prerequisite/readiness/decision). */
export async function runMissionUntilNextBlock(input) {
  return runStepsLoop({ ...input, stopOnBlock: true }, { singleStep: false });
}

export const runtimeMissionOrchestrator = {
  runNextStep,
  runAllAvailableSteps,
  runMissionUntilNextBlock,
  isRuntimeMissionOrchestratorEnabled,
};

export default runtimeMissionOrchestrator;
