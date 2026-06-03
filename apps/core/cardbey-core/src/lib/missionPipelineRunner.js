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
import { runPostMissionCompletionSummary } from './missionCompletion/postMissionSummary.js';
import { appendEvent as appendBlackboardEvent } from './missionBlackboard.js';
import { AgentCoordinator } from './orchestration/agentCoordinator.js';
import { getMissionParentMissionId } from './mission/missionParentLineage.js';
import { createOrchestrationBlackboard } from './orchestration/blackboardWriteBuffer.js';
import { safePipelineUpdate, safeMissionPipelineStepUpdate } from './safePipelineUpdate.js';
import {
  markMissionPipelineExecuting,
  clearMissionPipelineExecuting,
} from './missionExecutionGuard.js';
import { normalizeLocale } from './localePrompt.js';
import { resolveCheckpointOptionsForLocale } from './missionPipelineStructured.js';

function resolveMissionLocale(meta) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return 'en';
  return normalizeLocale(meta.locale ?? meta.preferredLocale ?? meta.lang ?? 'en');
}

function findCampaignPackageInResults(results) {
  if (!results || typeof results !== 'object') return null;
  for (const envelope of Object.values(results)) {
    if (envelope?.agentType === 'package' && envelope.result) return envelope.result;
  }
  return null;
}

/**
 * Shared multi-agent / campaign orchestration runner (does not affect step-based mission types).
 */
async function runOrchestratedAgentMission(prisma, mission, id, { orchestrationKind = 'default', returnToolName = 'multi_agent' } = {}) {
  const meta =
    mission.metadataJson && typeof mission.metadataJson === 'object' && !Array.isArray(mission.metadataJson)
      ? mission.metadataJson
      : {};
  const locale = resolveMissionLocale(meta);
  const goal =
    typeof meta.goal === 'string' && meta.goal.trim()
      ? meta.goal.trim()
      : typeof mission.title === 'string' && mission.title.trim()
        ? mission.title.trim()
        : orchestrationKind === 'campaign_orchestration'
          ? 'Campaign orchestration'
          : 'Multi-agent mission';
  const missionContext = meta.context ?? meta ?? {};
  const status = mission.status;

  if (status === 'queued' && canTransitionMissionPipeline('queued', 'executing')) {
    await safePipelineUpdate(prisma, {
      where: { id },
      data: { status: 'executing', runState: 'running', startedAt: mission.startedAt ?? new Date() },
    });
  } else if (mission.runState !== 'running') {
    await safePipelineUpdate(prisma, {
      where: { id },
      data: { runState: 'running' },
    });
  }

  const blackboard = createOrchestrationBlackboard(mission.id);
  const coordinator = new AgentCoordinator({
    missionId: mission.id,
    blackboard,
    locale,
    tenantKey: mission.tenantId ?? mission.createdBy ?? 'default',
    orchestrationKind,
    baseContext: {
      missionId: mission.id,
      tenantId: mission.tenantId ?? undefined,
      userId: mission.createdBy ?? undefined,
      ...(mission.targetId && (mission.targetType === 'store' || mission.targetType === 'draft_store')
        ? { storeId: mission.targetId }
        : {}),
      ...(mission.targetId ? { targetId: mission.targetId } : {}),
      ...(mission.targetType ? { targetType: mission.targetType } : {}),
    },
  });

  let results = {};
  try {
    results = await coordinator.orchestrate(goal, missionContext);
  } catch (e) {
    console.warn(`[MissionRunner] ${returnToolName} orchestrate error (non-fatal):`, e?.message || e);
    results = {};
  }

  const campaignPackage = findCampaignPackageInResults(results);

  if (campaignPackage) {
    try {
      const { persistCampaignPackageArtifacts } = await import(
        '../orchestrator/memory/artifactMemory.ts'
      );
      const persistResult = await persistCampaignPackageArtifacts({
        tenantId: mission.tenantId ?? mission.createdBy ?? 'default',
        missionId: mission.id,
        storeId:
          campaignPackage.storeId ??
          (mission.targetId && ['store', 'draft_store', 'business'].includes(mission.targetType)
            ? mission.targetId
            : null),
        parentMissionId: getMissionParentMissionId(mission),
        pkg: campaignPackage,
      });
      console.log('[MissionRunner] artifact persist after orchestration', persistResult);
    } catch (e) {
      console.error('[MissionRunner] artifact persist failed (non-fatal):', e?.message || e);
    }
  }

  try {
    await blackboard.appendEvent(mission.id, 'orchestration_complete', {
      results,
      ...(campaignPackage != null ? { campaignPackage } : {}),
      agentCount: coordinator.agents.size,
    });
    if (campaignPackage) {
      await blackboard.appendEvent(mission.id, 'package_assembled', {
        summary: `Campaign package assembled: ${campaignPackage.campaignName ?? 'Campaign'}`,
        campaignPackage,
      });
    }
    if (typeof blackboard.flushOrchestrationEvents === 'function') {
      await blackboard.flushOrchestrationEvents();
    }
  } catch (e) {
    console.warn('[MissionRunner] orchestration_complete append failed (non-fatal):', e?.message || e);
  }

  const priorOutputsAgg = parseJsonObject(mission.outputsJson);
  const outputsToPersist = {
    ...priorOutputsAgg,
    orchestrationResults: results,
    ...(campaignPackage != null ? { campaignPackage } : {}),
  };

  const dualMetaComplete = await buildRunnerDualWriteMetadataJson(
    prisma,
    id,
    mission.metadataJson,
    outputsToPersist,
  );

  await safePipelineUpdate(prisma, {
    where: { id },
    data: {
      status: 'completed',
      runState: 'done',
      completedAt: new Date(),
      progressTotalSteps: mission.progressTotalSteps ?? 1,
      progressCompletedSteps: mission.progressTotalSteps ?? 1,
      currentStepId: null,
      blockersJson: [],
      outputsJson: outputsToPersist,
      ...(dualMetaComplete != null ? { metadataJson: dualMetaComplete } : {}),
    },
  });

  void runPostMissionCompletionSummary({
    missionId: id,
    missionType: mission.type ?? null,
    metadataJson: mission.metadataJson,
    outputsJson: outputsToPersist,
  }).catch(() => {});

  return { ok: true, stepRun: true, toolName: returnToolName, status: 'completed', runState: 'done' };
}

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

function parseJsonObject(val) {
  if (val == null) return {};
  if (typeof val === 'object' && !Array.isArray(val)) return val;
  return {};
}

/** Flat env for conditional expressions (mission aggregate + completed step outputs). */
function buildMissionOutputsEnv(mission, steps) {
  const o = parseJsonObject(mission.outputsJson);
  if (!Array.isArray(steps)) return o;
  for (const s of steps) {
    if (s?.status !== 'completed') continue;
    const out =
      s.outputsJson && typeof s.outputsJson === 'object' && !Array.isArray(s.outputsJson)
        ? s.outputsJson
        : s.outputJson && typeof s.outputJson === 'object' && !Array.isArray(s.outputJson)
          ? s.outputJson
          : null;
    if (!out) continue;

    const cfg = s.configJson && typeof s.configJson === 'object' && !Array.isArray(s.configJson) ? s.configJson : null;
    const outputKey = cfg && typeof cfg.outputKey === 'string' ? cfg.outputKey : '';
    const ownerResponse = typeof out.ownerResponse === 'string' ? out.ownerResponse : null;
    if (outputKey && ownerResponse != null && o[outputKey] == null) {
      o[outputKey] = ownerResponse;
    }

    Object.assign(o, out);
  }
  return o;
}

/**
 * Evaluate a simple boolean expression with only `env` identifiers (e.g. logoChoice === "Skip").
 * @param {string} expr
 * @param {Record<string, unknown>} env
 */
function safeEvalMissionCondition(expr, env) {
  if (!expr || typeof expr !== 'string') return false;
  try {
    const keys = Object.keys(env);
    const vals = keys.map((k) => env[k]);
    // eslint-disable-next-line no-new-func
    const fn = new Function(...keys, `return (${expr});`);
    return Boolean(fn(...vals));
  } catch {
    return false;
  }
}

const PIPELINE_STEP_TERMINAL = new Set(['completed', 'skipped', 'failed']);

function summarizePipelineSteps(steps) {
  if (!Array.isArray(steps)) return { allStepsDone: false, completedCount: 0, totalSteps: 0, remaining: [] };
  const totalSteps = steps.length;
  const completedCount = steps.filter((s) => String(s?.status ?? '').toLowerCase() === 'completed').length;
  const allStepsDone =
    totalSteps > 0 &&
    steps.every((s) => PIPELINE_STEP_TERMINAL.has(String(s?.status ?? '').toLowerCase()));
  const remaining = steps
    .filter((s) => {
      const st = String(s?.status ?? '').toLowerCase();
      return st === 'pending' || st === 'running' || st === 'awaiting_input';
    })
    .map((s) => ({ toolName: s.toolName, status: s.status, stepKind: s.stepKind ?? 'action' }));
  return { allStepsDone, completedCount, totalSteps, remaining };
}

/**
 * Steps stuck in `running` after a crash or premature mirror must not block retries forever.
 * @param {import('../lib/prismaClient.js').PrismaClient} prisma
 * @param {string} missionId
 * @param {Array<{ id: string, status: string, toolName: string }>} steps
 */
async function recoverOrphanedRunningSteps(prisma, missionId, steps) {
  const orphaned = (steps || []).filter((s) => String(s?.status ?? '').toLowerCase() === 'running');
  if (orphaned.length === 0) return steps;
  console.warn('[MissionRunner] found orphaned running steps on resume:', orphaned.map((s) => s.toolName));
  const now = new Date();
  for (const step of orphaned) {
    await safeMissionPipelineStepUpdate(
      prisma,
      {
        where: { id: step.id },
        data: {
          status: 'failed',
          completedAt: now,
          errorJson: {
            code: 'orphaned_on_resume',
            message: 'Step was still running when the pipeline resumed; marked failed so the mission can retry.',
          },
        },
      },
      { missionId },
    );
  }
  return prisma.missionPipelineStep.findMany({
    where: { missionId },
    orderBy: { orderIndex: 'asc' },
  });
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

  markMissionPipelineExecuting(id);
  try {
    return await runNextMissionPipelineStepBody(prisma, id);
  } finally {
    clearMissionPipelineExecuting(id);
  }
}

/**
 * @param {import('../lib/prismaClient.js').PrismaClient} prisma
 * @param {string} id
 */
async function runNextMissionPipelineStepBody(prisma, id) {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[MissionRunner] running next step for mission=${id}`);
  }

  const mission = await prisma.missionPipeline.findUnique({
    where: { id },
    include: { steps: { orderBy: { orderIndex: 'asc' } } },
  });
  console.log('[RUNNER_DEBUG] mission status check:', {
    missionId: id,
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

  // ── Multi-agent / campaign orchestration mission types ─────────────────────
  const typeToken = typeof mission.type === 'string' ? mission.type.trim().toLowerCase() : '';
  if (typeToken === 'multi_agent') {
    return runOrchestratedAgentMission(prisma, mission, id, {
      orchestrationKind: 'default',
      returnToolName: 'multi_agent',
    });
  }
  if (typeToken === 'campaign_orchestration') {
    return runOrchestratedAgentMission(prisma, mission, id, {
      orchestrationKind: 'campaign_orchestration',
      returnToolName: 'campaign_orchestration',
    });
  }

  let steps = mission.steps || [];
  steps = await recoverOrphanedRunningSteps(prisma, id, steps);
  const nextStep = steps.find((s) => s.status === 'pending');
  if (!nextStep) {
    return { ok: true, stepRun: false, status: mission.status, runState: mission.runState };
  }

  const toolName = nextStep.toolName;
  const stepKind = nextStep.stepKind || 'action';

  // ── Checkpoint: suspend for owner response (no tool dispatch) ────────────────
  if (stepKind === 'checkpoint' || toolName === 'mission.checkpoint') {
    if (status === 'queued' && canTransitionMissionPipeline('queued', 'executing')) {
      await safePipelineUpdate(prisma, {
        where: { id },
        data: {
          status: 'executing',
          runState: 'running',
          currentStepId: nextStep.id,
          startedAt: mission.startedAt ?? new Date(),
        },
      });
    } else if (mission.runState !== 'running') {
      await safePipelineUpdate(prisma, {
        where: { id },
        data: { runState: 'running', currentStepId: nextStep.id },
      });
    }

    const cfg = nextStep.configJson && typeof nextStep.configJson === 'object' ? nextStep.configJson : {};
    const mergedConfig = {
      ...cfg,
      awaitingSince: new Date().toISOString(),
    };
    await safeMissionPipelineStepUpdate(
      prisma,
      {
        where: { id: nextStep.id },
        data: { status: 'awaiting_input', configJson: mergedConfig },
      },
      { missionId: id },
    );
    if (!canTransitionMissionPipeline('executing', 'awaiting_input')) {
      return { ok: false, error: 'transition_denied_checkpoint', status: mission.status };
    }
    await safePipelineUpdate(prisma, {
      where: { id },
      data: { status: 'awaiting_input', runState: 'blocked_on_checkpoint', currentStepId: nextStep.id },
    });

    const { broadcastMissionCheckpoint } = await import('../realtime/simpleSse.js');
    const checkpointMeta =
      mission.metadataJson && typeof mission.metadataJson === 'object' && !Array.isArray(mission.metadataJson)
        ? mission.metadataJson
        : {};
    const pipelineLocale = resolveMissionLocale(checkpointMeta);
    const optionItems = Array.isArray(cfg.optionItems) ? cfg.optionItems : null;
    const resolvedOptions = optionItems
      ? resolveCheckpointOptionsForLocale(optionItems, pipelineLocale)
      : null;
    broadcastMissionCheckpoint(id, {
      stepId: nextStep.id,
      prompt: cfg.prompt,
      options: cfg.options ?? null,
      ...(optionItems ? { optionItems } : {}),
      ...(resolvedOptions ? { displayOptions: resolvedOptions } : {}),
      outputKey: cfg.outputKey ?? null,
    });

    return {
      ok: true,
      stepRun: true,
      toolName,
      status: 'awaiting_input',
      runState: 'blocked_on_checkpoint',
      checkpoint: true,
    };
  }

  console.log('[RUNNER_DEBUG] dispatching tool:', {
    toolName,
    missionId: id,
    stepId: nextStep?.id,
    stepKind,
  });
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[MissionRunner] step started: ${toolName}`);
  }

  if (status === 'queued' && canTransitionMissionPipeline('queued', 'executing')) {
    await safePipelineUpdate(prisma, {
      where: { id },
      data: { status: 'executing', runState: 'running', currentStepId: nextStep.id, startedAt: mission.startedAt ?? new Date() },
    });
  } else if (mission.runState !== 'running') {
    await safePipelineUpdate(prisma, {
      where: { id },
      data: { runState: 'running', currentStepId: nextStep.id },
    });
  }

  await safeMissionPipelineStepUpdate(
    prisma,
    {
      where: { id: nextStep.id },
      data: { status: 'running', startedAt: new Date() },
    },
    { missionId: id },
  );

  const stepOutputs = buildStepOutputsFromSteps(steps);
  let input = buildStepInput(mission, nextStep);
  let dispatchToolName = toolName;

  if (stepKind === 'conditional' || toolName === 'mission.conditional') {
    const cfg = nextStep.configJson && typeof nextStep.configJson === 'object' ? nextStep.configJson : {};
    const env = buildMissionOutputsEnv(mission, steps);
    const condition = typeof cfg.condition === 'string' ? cfg.condition : '';
    const conditionResult = safeEvalMissionCondition(condition, env);

    if (process.env.NODE_ENV !== 'production') {
      console.log('[ConditionalStep] evaluating', {
        stepId: nextStep.id,
        condition: cfg?.condition,
        ifTrueTool: cfg?.ifTrueTool,
        ifFalseTool: cfg?.ifFalseTool,
      });
      try {
        const priorSteps = await prisma.missionPipelineStep.findMany({
          where: {
            missionId: nextStep.missionId,
            orderIndex: { lt: nextStep.orderIndex },
            status: 'completed',
          },
          orderBy: { orderIndex: 'asc' },
          select: { label: true, outputsJson: true, outputJson: true, configJson: true },
        });
        console.log(
          '[ConditionalStep] prior step outputs:',
          priorSteps.map((s) => ({
            label: s.label,
            outputsJson: s.outputsJson,
            outputJson: s.outputJson,
            configJson: s.configJson,
          })),
        );
      } catch (e) {
        console.warn('[ConditionalStep] prior step fetch failed:', (e && e.message) || String(e));
      }
      console.log('[ConditionalStep] context:', env);
      console.log('[ConditionalStep] condition:', condition);
      console.log('[ConditionalStep] result:', conditionResult);
    }

    dispatchToolName = conditionResult ? cfg.ifTrueTool : cfg.ifFalseTool;
    if (!dispatchToolName || typeof dispatchToolName !== 'string') {
      await safeMissionPipelineStepUpdate(
        prisma,
        {
          where: { id: nextStep.id },
          data: { status: 'failed', errorJson: { code: 'conditional_missing_branch' }, completedAt: new Date() },
        },
        { missionId: id },
      );
      await safePipelineUpdate(prisma, {
        where: { id },
        data: { status: 'failed', runState: 'error', failedAt: new Date() },
      });
      return { ok: true, stepRun: true, toolName, status: 'failed', runState: 'error' };
    }

    const branchExtra = conditionResult ? cfg.ifTrueInput : cfg.ifFalseInput;
    input = buildStepInput(mission, nextStep);
    if (branchExtra && typeof branchExtra === 'object') {
      Object.assign(input, branchExtra);
    }
    input = enrichStepInputFromPriorOutputs(dispatchToolName, input, stepOutputs);
  } else {
    input = enrichStepInputFromPriorOutputs(toolName, input, stepOutputs);
  }

  const priorOutputsAgg = parseJsonObject(mission.outputsJson);
  const metaJson =
    mission.metadataJson && typeof mission.metadataJson === 'object' && !Array.isArray(mission.metadataJson)
      ? mission.metadataJson
      : {};
  const context = {
    missionId: id,
    stepId: nextStep.id,
    stepOutputs,
    /** Legacy alias: some executors (e.g. analyze_store) read context.outputs.* */
    outputs: { ...priorOutputsAgg, ...stepOutputs },
    tenantId: mission.tenantId ?? undefined,
    userId: mission.createdBy ?? undefined,
    locale: resolveMissionLocale(metaJson),
    ...(String(mission.type || '').toUpperCase() === 'MAINTENANCE' ? { missionType: 'MAINTENANCE' } : {}),
  };
  if (mission.targetId && (mission.targetType === 'store' || mission.targetType === 'draft_store')) {
    context.storeId = mission.targetId;
  }
  const result = await dispatchTaskWithAgentHint(dispatchToolName, input, context);

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[MissionRunner] step result: ${dispatchToolName} status=${result.status}`);
  }

  const now = new Date();
  const stepOutputPayload =
    stepKind === 'conditional' || toolName === 'mission.conditional'
      ? { branchTool: dispatchToolName, output: result.output ?? {} }
      : result.output ?? null;
  const stepUpdate = {
    completedAt: now,
    outputJson: stepOutputPayload,
    errorJson: result.error ?? null,
    status: result.status === 'ok' ? 'completed' : result.status === 'blocked' ? 'blocked' : 'failed',
  };
  await safeMissionPipelineStepUpdate(
    prisma,
    {
      where: { id: nextStep.id },
      data: stepUpdate,
    },
    { missionId: id },
  );

  // Persist accumulated stepOutputs so consensus engine (Step 4) can read prior run's MarketReport without re-calling researcher.
  // Merge prior mission.outputsJson first so owner checkpoint fields (logoChoice, heroImageChoice) survive tools that share toolName keys in stepOutputs.
  // Flatten structured store build ids for /state parity with POST /missions/:id/run (draftId, jobId, generationRunId at top level).
  // On failure, also persist _failed so debugging can see the failed step's error and any partial output without loading the step record.
  const structuredFlat =
    result.status === 'ok' &&
    toolName === 'structured_store_build' &&
    stepOutputPayload &&
    typeof stepOutputPayload === 'object' &&
    !Array.isArray(stepOutputPayload)
      ? {
          ...(typeof stepOutputPayload.draftId === 'string' ? { draftId: stepOutputPayload.draftId } : {}),
          ...(typeof stepOutputPayload.generationRunId === 'string'
            ? { generationRunId: stepOutputPayload.generationRunId }
            : {}),
          ...(typeof stepOutputPayload.jobId === 'string' ? { jobId: stepOutputPayload.jobId } : {}),
          ...(typeof stepOutputPayload.storeId === 'string' ? { storeId: stepOutputPayload.storeId } : {}),
        }
      : {};
  const outputsToPersist =
    result.status === 'ok'
      ? { ...priorOutputsAgg, ...structuredFlat, ...stepOutputs, [toolName]: stepOutputPayload ?? {} }
      : result.status === 'failed'
        ? {
            ...priorOutputsAgg,
            ...stepOutputs,
            _failed: { tool: dispatchToolName, error: result.error ?? null, output: result.output ?? null },
          }
        : { ...priorOutputsAgg, ...stepOutputs };

  const stepSummary = summarizePipelineSteps(
    steps.map((s) => (s.id === nextStep.id ? { ...s, status: stepUpdate.status } : s)),
  );
  const { allStepsDone, completedCount, totalSteps, remaining } = stepSummary;

  if (stepUpdate.status === 'completed' && !allStepsDone && remaining.length > 0) {
    console.log('[MissionRunner] steps still remaining — not completing yet:', remaining);
    if (
      (stepKind === 'conditional' || toolName === 'mission.conditional') &&
      process.env.NODE_ENV !== 'production'
    ) {
      console.log('[MissionRunner] conditional resolved → advancing to next pending step on next run');
    }
  }

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
    await safePipelineUpdate(prisma, {
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
    await safePipelineUpdate(prisma, {
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

  if (allStepsDone && stepUpdate.status === 'completed') {
    const missionRow = await prisma.mission.findUnique({
      where: { id },
      select: { context: true },
    });
    const missionCtx =
      missionRow?.context && typeof missionRow.context === 'object' && !Array.isArray(missionRow.context)
        ? missionRow.context
        : {};
    const pipeMeta =
      mission.metadataJson && typeof mission.metadataJson === 'object' && !Array.isArray(mission.metadataJson)
        ? mission.metadataJson
        : {};
    const tier2PendingCtx =
      missionCtx.storeBuildQaTier2Pending ?? pipeMeta.storeBuildQaTier2Pending ?? null;
    const isPendingApproval =
      missionCtx.qaApprovalPending === true ||
      pipeMeta.qaApprovalPending === true ||
      (tier2PendingCtx &&
        typeof tier2PendingCtx === 'object' &&
        (tier2PendingCtx.draftId || (Array.isArray(tier2PendingCtx.fixes) && tier2PendingCtx.fixes.length > 0)));

    if (process.env.NODE_ENV !== 'production' || process.env.QA_AUTOFIX_DEBUG === '1') {
      console.log('[pipeline-debug] checking qa gate:', {
        qaApprovalPending: missionCtx.qaApprovalPending ?? pipeMeta.qaApprovalPending,
        storeBuildQaTier2Pending: Boolean(tier2PendingCtx),
        allStepsComplete: allStepsDone,
        isPendingApproval,
      });
    }

    if (isPendingApproval) {
      const dualMetaAwaiting = await buildRunnerDualWriteMetadataJson(
        prisma,
        id,
        mission.metadataJson,
        outputsToPersist,
      );
      await safePipelineUpdate(prisma, {
        where: { id },
        data: {
          status: 'awaiting_input',
          runState: 'blocked_on_checkpoint',
          progressCompletedSteps: completedCount,
          progressTotalSteps: totalSteps,
          currentStepId: null,
          outputsJson: outputsToPersist,
          ...(dualMetaAwaiting != null ? { metadataJson: dualMetaAwaiting } : {}),
        },
      });
      if (process.env.NODE_ENV !== 'production') {
        console.log('[MissionRunner] catalog Tier 2 approval pending — mission held at awaiting_input', {
          missionId: id,
        });
      }
      return { ok: true, stepRun: true, toolName, status: 'awaiting_input', runState: 'blocked_on_checkpoint' };
    }

    const dualMetaComplete = await buildRunnerDualWriteMetadataJson(
      prisma,
      id,
      mission.metadataJson,
      outputsToPersist,
    );
    await safePipelineUpdate(prisma, {
      where: { id },
      data: {
        status: 'completed',
        runState: 'done',
        completedAt: now,
        progressCompletedSteps: completedCount,
        progressTotalSteps: totalSteps,
        currentStepId: null,
        blockersJson: [],
        outputsJson: outputsToPersist,
        ...(dualMetaComplete != null ? { metadataJson: dualMetaComplete } : {}),
      },
    });
    if (process.env.NODE_ENV !== 'production') {
      console.log('[MissionRunner] all steps done → marking completed', {
        missionId: id,
        completedSteps: completedCount,
        totalSteps,
      });
    }
    const metaDbg =
      mission.metadataJson && typeof mission.metadataJson === 'object' && !Array.isArray(mission.metadataJson)
        ? mission.metadataJson
        : {};
    if (process.env.NODE_ENV !== 'production') {
      console.log('[postMissionSummary] missionType debug:', {
        type: mission.type,
        intentType: mission.intentType,
        metadataType: metaDbg.missionType,
        intentMode: metaDbg.intentMode,
      });
    }
    void runPostMissionCompletionSummary({
      missionId: id,
      missionType: mission.type ?? null,
      metadataJson: mission.metadataJson,
      outputsJson: outputsToPersist,
    }).catch(() => {});

    const metaForPrereq =
      mission.metadataJson && typeof mission.metadataJson === 'object' && !Array.isArray(mission.metadataJson)
        ? mission.metadataJson
        : {};
    if (metaForPrereq.runtimePrerequisiteChild === true) {
      void (async () => {
        try {
          const { isRuntimePrerequisiteResolutionEnabled } = await import(
            './runtime/runtimePrerequisiteResolver.js'
          );
          if (!isRuntimePrerequisiteResolutionEnabled()) return;
          const { tryResumeAfterPrerequisiteChildCompleted } = await import(
            './runtime/runtimePrerequisiteService.js'
          );
          await tryResumeAfterPrerequisiteChildCompleted(id, {
            user: mission.createdBy ? { id: mission.createdBy } : null,
            autoResume: true,
          });
        } catch (e) {
          console.warn('[RuntimePrerequisite] child completion resume failed:', e?.message || e);
        }
      })();
    }

    return { ok: true, stepRun: true, toolName, status: 'completed', runState: 'done' };
  }

  const dualMetaProgress = await buildRunnerDualWriteMetadataJson(
    prisma,
    id,
    mission.metadataJson,
    outputsToPersist,
  );
  await safePipelineUpdate(prisma, {
    where: { id },
    data: {
      progressCompletedSteps: completedCount,
      progressTotalSteps: totalSteps,
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
