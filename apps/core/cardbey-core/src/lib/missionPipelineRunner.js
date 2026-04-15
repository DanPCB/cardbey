/**
 * Mission Pipeline Step Runner - run one pending step at a time.
 * No background workers, no parallel execution, no retries. Invoke manually or via API.
 *
 * stepOutputs: Before each step, outputs from all previously completed steps are built and passed
 * in context.stepOutputs (keyed by toolName). Downstream steps read e.g. context.stepOutputs.market_research.marketReport.
 * buildStepOutputsFromSteps returns a new object each time (snapshot from DB) — executors never receive a shared
 * reference, so there is no risk of seeing outputs from steps that have not run yet.
 *
 * Persistence: After each step, we persist to MissionPipeline.outputsJson (aggregate). Naming: use outputsJson
 * (plural) on the mission for the aggregate; use outputJson (singular) on MissionPipelineStep for that step's
 * output only. Reading mission.outputJson will be undefined — the aggregate lives on mission.outputsJson.
 * On failure we also persist _failed: { tool, error, output } in outputsJson for debugging (partial output + error).
 *
 * Fail-fast: A failed step aborts the pipeline (mission status → failed); we do not run subsequent steps.
 */

import { getPrismaClient } from '../lib/prisma.js';
import { canTransitionMissionPipeline } from './missionPipelineTransitions.js';
import { dispatchTaskWithAgentHint } from './agentPlanning/agentOrchestrator.js';
import { enrichStepInputFromPriorOutputs } from './agentPlanning/artifactInputEnrichment.js';
import { buildRunnerDualWriteMetadataJson } from './orchestrator/pipelineCanonicalResults.js';

/**
 * Build execution input for a step from mission context (e.g. targetId as storeId) and metadata (e.g. slotKey, promotionId).
 * @param {object} mission - MissionPipeline record with targetType, targetId, metadataJson
 * @param {object} step - MissionPipelineStep record with toolName
 * @returns {object}
 */
function buildStepInput(mission, step) {
  const input = {};
  const targetId = mission.targetId;
  if (targetId && (mission.targetType === 'store' || mission.targetType === 'draft_store')) {
    input.storeId = targetId;
  }
  if (mission.metadataJson && typeof mission.metadataJson === 'object' && !Array.isArray(mission.metadataJson)) {
    Object.assign(input, mission.metadataJson);
  }
  if (step.inputJson && typeof step.inputJson === 'object' && !Array.isArray(step.inputJson)) {
    Object.assign(input, step.inputJson);
  }
  return input;
}

/**
 * Build stepOutputs from completed steps (keyed by toolName). Returns a new object each time (snapshot).
 * Downstream steps read prior outputs via context.stepOutputs (e.g. context.stepOutputs.market_research.marketReport).
 * Not shared across concurrent calls — each dispatch gets a fresh snapshot from DB.
 * @param {Array<{ toolName: string, status: string, outputJson: object | null }>} steps - ordered steps
 * @returns {Record<string, object>}
 */
function buildStepOutputsFromSteps(steps) {
  const stepOutputs = {};
  if (!Array.isArray(steps)) return stepOutputs;
  for (const s of steps) {
    if (s?.status === 'completed' && s?.outputJson != null && typeof s.outputJson === 'object' && !Array.isArray(s.outputJson)) {
      stepOutputs[s.toolName] = s.outputJson;
    }
  }
  return stepOutputs;
}

/**
 * Run the next pending mission pipeline step for a given mission.
 * 1) Load mission + steps; 2) Ensure status queued or executing; 3) Find first pending step;
 * 4) Mark mission executing, step running; 5) Dispatch tool; 6) Update step and mission from result.
 *
 * @param {string} missionId
 * @returns {Promise<{ ok: boolean, stepRun?: boolean, toolName?: string, status?: string, runState?: string, error?: string }>}
 */
export async function runNextMissionPipelineStep(missionId) {
  console.log('[RUNNER_DEBUG] runNextMissionPipelineStep called:', missionId);
  const prisma = getPrismaClient();
  const id = typeof missionId === 'string' ? missionId.trim() : '';
  if (!id) {
    return { ok: false, error: 'mission_id_required' };
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[MissionRunner] running next step for mission=${id}`);
  }

  const mission = await prisma.missionPipeline.findUnique({
    where: { id },
    include: { steps: { orderBy: { orderIndex: 'asc' } } },
  });
  console.log('[RUNNER_DEBUG] mission status check:', {
    missionId,
    status: mission?.status,
    runState: mission?.runState,
    stepsCount: mission?.steps?.length,
  });
  if (!mission) {
    return { ok: false, error: 'not_found' };
  }

  const status = mission.status;
  if (status !== 'queued' && status !== 'executing') {
    return { ok: false, error: 'invalid_state', status };
  }

  const steps = mission.steps || [];
  const nextStep = steps.find((s) => s.status === 'pending');
  if (!nextStep) {
    return { ok: true, stepRun: false, status: mission.status, runState: mission.runState };
  }

  const toolName = nextStep.toolName;
  console.log('[RUNNER_DEBUG] dispatching tool:', {
    toolName,
    missionId,
    stepId: nextStep?.id,
  });
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[MissionRunner] step started: ${toolName}`);
  }

  if (status === 'queued' && canTransitionMissionPipeline('queued', 'executing')) {
    await prisma.missionPipeline.update({
      where: { id },
      data: { status: 'executing', runState: 'running', currentStepId: nextStep.id, startedAt: mission.startedAt ?? new Date() },
    });
  } else if (mission.runState !== 'running') {
    await prisma.missionPipeline.update({
      where: { id },
      data: { runState: 'running', currentStepId: nextStep.id },
    });
  }

  await prisma.missionPipelineStep.update({
    where: { id: nextStep.id },
    data: { status: 'running', startedAt: new Date() },
  });

  // Accumulated outputs of all previously completed steps — downstream steps read e.g. context.stepOutputs.market_research.marketReport
  const stepOutputs = buildStepOutputsFromSteps(steps);
  let input = buildStepInput(mission, nextStep);
  input = enrichStepInputFromPriorOutputs(toolName, input, stepOutputs);
  const context = {
    missionId: id,
    stepId: nextStep.id,
    stepOutputs,
    tenantId: mission.tenantId ?? undefined,
    userId: mission.createdBy ?? undefined,
  };
  if (mission.targetId && (mission.targetType === 'store' || mission.targetType === 'draft_store')) {
    context.storeId = mission.targetId;
  }
  const result = await dispatchTaskWithAgentHint(toolName, input, context);

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[MissionRunner] step result: ${toolName} status=${result.status}`);
  }

  const now = new Date();
  const stepUpdate = {
    completedAt: now,
    outputJson: result.output ?? null,
    errorJson: result.error ?? null,
    status: result.status === 'ok' ? 'completed' : result.status === 'blocked' ? 'blocked' : 'failed',
  };
  await prisma.missionPipelineStep.update({
    where: { id: nextStep.id },
    data: stepUpdate,
  });

  // Persist accumulated stepOutputs so consensus engine (Step 4) can read prior run's MarketReport without re-calling researcher.
  // On failure, also persist _failed so debugging can see the failed step's error and any partial output without loading the step record.
  const outputsToPersist =
    result.status === 'ok'
      ? { ...stepOutputs, [toolName]: result.output ?? {} }
      : result.status === 'failed'
        ? { ...stepOutputs, _failed: { tool: toolName, error: result.error ?? null, output: result.output ?? null } }
        : stepOutputs;

  const totalSteps = steps.length;
  const newCompleted = (mission.progressCompletedSteps ?? 0) + 1;
  const allComplete = stepUpdate.status === 'completed' && newCompleted >= totalSteps;

  if (result.status === 'blocked') {
    const blockers = Array.isArray(mission.blockersJson) ? [...mission.blockersJson] : [];
    blockers.push({
      stepId: nextStep.id,
      toolName,
      code: result.blocker?.code,
      message: result.blocker?.message,
      requiredAction: result.blocker?.requiredAction,
    });
    const dualMetaPaused = await buildRunnerDualWriteMetadataJson(
      prisma,
      id,
      mission.metadataJson,
      outputsToPersist,
    );
    await prisma.missionPipeline.update({
      where: { id },
      data: {
        status: 'paused',
        runState: 'waiting',
        blockersJson: blockers,
        currentStepId: nextStep.id,
        progressCompletedSteps: mission.progressCompletedSteps,
        outputsJson: outputsToPersist,
        ...(dualMetaPaused != null ? { metadataJson: dualMetaPaused } : {}),
      },
    });
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[MissionRunner] mission updated: paused runState=waiting`);
    }
    return { ok: true, stepRun: true, toolName, status: 'paused', runState: 'waiting' };
  }

  if (result.status === 'failed') {
    const dualMetaFailed = await buildRunnerDualWriteMetadataJson(
      prisma,
      id,
      mission.metadataJson,
      outputsToPersist,
    );
    await prisma.missionPipeline.update({
      where: { id },
      data: {
        status: 'failed',
        runState: 'error',
        failedAt: now,
        currentStepId: nextStep.id,
        progressCompletedSteps: mission.progressCompletedSteps,
        outputsJson: outputsToPersist,
        ...(dualMetaFailed != null ? { metadataJson: dualMetaFailed } : {}),
      },
    });
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[MissionRunner] mission updated: failed runState=error`);
    }
    return { ok: true, stepRun: true, toolName, status: 'failed', runState: 'error' };
  }

  if (allComplete) {
    const dualMetaComplete = await buildRunnerDualWriteMetadataJson(
      prisma,
      id,
      mission.metadataJson,
      outputsToPersist,
    );
    await prisma.missionPipeline.update({
      where: { id },
      data: {
        status: 'completed',
        runState: 'done',
        completedAt: now,
        progressCompletedSteps: newCompleted,
        currentStepId: null,
        blockersJson: [],
        outputsJson: outputsToPersist,
        ...(dualMetaComplete != null ? { metadataJson: dualMetaComplete } : {}),
      },
    });
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[MissionRunner] mission updated: completed runState=done`);
    }
    return { ok: true, stepRun: true, toolName, status: 'completed', runState: 'done' };
  }

  const dualMetaProgress = await buildRunnerDualWriteMetadataJson(
    prisma,
    id,
    mission.metadataJson,
    outputsToPersist,
  );
  await prisma.missionPipeline.update({
    where: { id },
    data: {
      progressCompletedSteps: newCompleted,
      currentStepId: null,
      outputsJson: outputsToPersist,
      ...(dualMetaProgress != null ? { metadataJson: dualMetaProgress } : {}),
    },
  });
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[MissionRunner] mission updated: executing runState=running`);
  }
  return { ok: true, stepRun: true, toolName, status: 'executing', runState: 'running' };
}
