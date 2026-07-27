/**
 * ============================================================
 * PHASE C.3 — DYNAMIC PLAN EXECUTOR
 * ============================================================
 *
 * Persists dynamic plans to mission metadata and delegates step
 * execution to the Runtime Mission Orchestrator.
 */

import { getPrismaClient } from '../prisma.js';
import { insertMissingPipelineSteps } from '../missionPipelineStepWriter.js';
import {
  mergeProactivePlanBundleIntoMetadata,
  readProactivePlanSteps,
} from '../runtime/runtimeOrchestrationState.js';
import {
  runAllAvailableSteps,
  runMissionUntilNextBlock,
  runNextStep,
} from '../runtime/runtimeMissionOrchestrator.js';
import { dynamicPlanToProactivePlanSteps } from './planConverters.js';
import { emitPlanStepCompleted, emitPlanStepStarted } from './planBlackboard.js';

/**
 * Whether server-side dynamic plan execution is enabled.
 */
export function isDynamicPlannerExecutionEnabled() {
  return String(process.env.ENABLE_DYNAMIC_PLANNER_EXECUTION ?? '').trim().toLowerCase() === 'true';
}

/**
 * @param {unknown} serialized
 * @returns {import('./plannerTypes.js').DynamicPlan | null}
 */
export function deserializeClientDynamicPlan(serialized) {
  if (!serialized || typeof serialized !== 'object' || Array.isArray(serialized)) return null;
  const raw = /** @type {Record<string, unknown>} */ (serialized);
  const stepsRaw = Array.isArray(raw.steps) ? raw.steps : [];
  if (stepsRaw.length === 0) return null;

  const steps = stepsRaw.map((row, idx) => {
    const step = row && typeof row === 'object' && !Array.isArray(row) ? row : {};
    const order = Math.floor(Number(step.order ?? idx + 1));
    return {
      id: String(step.id ?? `step_${order}`),
      name: String(step.name ?? `step_${order}`),
      label: String(step.label ?? `Step ${order}`),
      labels:
        step.labels && typeof step.labels === 'object' && !Array.isArray(step.labels)
          ? step.labels
          : { en: String(step.label ?? `Step ${order}`) },
      type: String(step.type ?? 'action'),
      tool: typeof step.tool === 'string' ? step.tool : null,
      order: Number.isFinite(order) && order >= 1 ? order : idx + 1,
      optional: step.optional === true,
      dependencies: Array.isArray(step.dependencies) ? step.dependencies.map(String) : [],
      estimatedDuration: Math.max(1, Math.floor(Number(step.estimatedDuration) || 3)),
      checkpointConfig:
        step.checkpoint && typeof step.checkpoint === 'object' && !Array.isArray(step.checkpoint)
          ? step.checkpoint
          : step.checkpointConfig && typeof step.checkpointConfig === 'object'
            ? step.checkpointConfig
            : undefined,
      guestBehavior: typeof step.guestBehavior === 'string' ? step.guestBehavior : undefined,
    };
  });

  const metadataRaw =
    raw.metadata && typeof raw.metadata === 'object' && !Array.isArray(raw.metadata)
      ? raw.metadata
      : {};

  return {
    planId: String(raw.planId ?? `plan_client_${Date.now()}`),
    intent: String(raw.intent ?? 'general_chat'),
    workflow: String(raw.workflow ?? 'unknown'),
    steps,
    metadata: {
      totalSteps: Math.floor(Number(metadataRaw.totalSteps) || steps.length),
      estimatedDuration: Math.floor(Number(metadataRaw.estimatedDuration) || steps.length * 3),
      requiresSignIn: metadataRaw.requiresSignIn === true,
      requiresStore: metadataRaw.requiresStore === true,
      primaryTool: typeof metadataRaw.primaryTool === 'string' ? metadataRaw.primaryTool : null,
      tags: Array.isArray(metadataRaw.tags) ? metadataRaw.tags.map(String) : [],
      priority: Math.floor(Number(metadataRaw.priority) || 3),
    },
    contextSnapshot:
      raw.contextSnapshot && typeof raw.contextSnapshot === 'object' && !Array.isArray(raw.contextSnapshot)
        ? raw.contextSnapshot
        : {},
    reasoning: Array.isArray(raw.reasoning) ? raw.reasoning.map(String) : [],
    suggestedActions: Array.isArray(raw.suggestedActions) ? raw.suggestedActions : [],
    generatedAt: typeof raw.generatedAt === 'string' ? raw.generatedAt : new Date().toISOString(),
    version: typeof raw.version === 'string' ? raw.version : '1.0.0',
  };
}

/**
 * @param {import('./plannerTypes.js').PlanStep} step
 * @param {string} missionId
 */
export function dynamicPlanStepToPipelineRow(step, missionId) {
  const stepKind = step.type === 'checkpoint' ? 'checkpoint' : 'action';
  const toolName =
    (typeof step.tool === 'string' && step.tool.trim()) ||
    (stepKind === 'checkpoint' ? 'mission.checkpoint' : 'mission.step');

  return {
    missionId,
    orderIndex: Math.max(0, (step.order ?? 1) - 1),
    toolName,
    label: step.label || step.name || `Step ${step.order ?? 1}`,
    status: 'pending',
    stepKind,
    configJson: {
      dynamicStepId: step.id,
      dynamicPlanner: true,
      ...(step.checkpointConfig ? { checkpoint: step.checkpointConfig } : {}),
    },
  };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} missionId
 * @param {import('./plannerTypes.js').DynamicPlan} plan
 * @param {{ proactivePlanSteps?: Array<Record<string, unknown>>; planParameters?: Record<string, unknown> }} [options]
 */
export async function persistDynamicPlanToMission(prisma, missionId, plan, options = {}) {
  const proactivePlanSteps =
    options.proactivePlanSteps?.length > 0
      ? options.proactivePlanSteps
      : dynamicPlanToProactivePlanSteps(plan);

  const existing = await prisma.missionPipeline.findUnique({
    where: { id: missionId },
    select: { metadataJson: true },
  });
  if (!existing) {
    return { ok: false, code: 'NOT_FOUND', message: 'Mission not found' };
  }

  let metadataJson = mergeProactivePlanBundleIntoMetadata(existing.metadataJson ?? {}, {
    planSteps: proactivePlanSteps,
    planParameters: options.planParameters ?? {},
  });

  metadataJson = {
    ...metadataJson,
    dynamicPlanner: {
      planId: plan.planId,
      intent: plan.intent,
      workflow: plan.workflow,
      version: plan.version,
      source: 'dynamic_planner',
      persistedAt: new Date().toISOString(),
      totalSteps: plan.metadata?.totalSteps ?? plan.steps.length,
    },
  };

  await prisma.missionPipeline.update({
    where: { id: missionId },
    data: { metadataJson },
  });

  return { ok: true, proactivePlanSteps, metadataJson };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} missionId
 * @param {import('./plannerTypes.js').DynamicPlan} plan
 */
export async function materializeDynamicPlanPipelineSteps(prisma, missionId, plan) {
  const rows = (plan.steps || []).map((step) => dynamicPlanStepToPipelineRow(step, missionId));
  if (rows.length === 0) return { inserted: 0, skipped: 0, mode: 'noop' };

  const result = await insertMissingPipelineSteps(prisma, missionId, rows, {
    logPrefix: '[DynamicPlanner]',
  });

  await prisma.missionPipeline.update({
    where: { id: missionId },
    data: { progressTotalSteps: plan.steps.length },
  });

  return result;
}

/**
 * @param {import('./plannerTypes.js').DynamicPlan} plan
 * @param {number | null | undefined} stepNumber
 */
export function resolvePlanStepForExecution(plan, stepNumber) {
  const steps = Array.isArray(plan?.steps) ? plan.steps : [];
  if (steps.length === 0) return null;

  const forced = Math.floor(Number(stepNumber));
  if (Number.isFinite(forced) && forced >= 1) {
    return steps.find((s) => s.order === forced) ?? steps[forced - 1] ?? null;
  }

  return steps.find((s) => s.type === 'action' && s.tool) ?? steps[0] ?? null;
}

/**
 * @param {string} missionId
 * @param {import('./plannerTypes.js').DynamicPlan | null | undefined} dynamicPlan
 */
export async function loadDynamicPlanFromMission(missionId, dynamicPlan = null) {
  if (dynamicPlan?.steps?.length) return dynamicPlan;

  const prisma = getPrismaClient();
  const row = await prisma.missionPipeline.findUnique({
    where: { id: missionId },
    select: { metadataJson: true },
  });
  if (!row) return null;

  const meta =
    row.metadataJson && typeof row.metadataJson === 'object' && !Array.isArray(row.metadataJson)
      ? row.metadataJson
      : {};
  const stored = meta.dynamicPlanner?.serialized;
  const fromStored = stored ? deserializeClientDynamicPlan(stored) : null;
  if (fromStored) return fromStored;

  const proactiveSteps = readProactivePlanSteps(meta);
  if (proactiveSteps.length === 0) return null;

  const plannerMeta = meta.dynamicPlanner && typeof meta.dynamicPlanner === 'object' ? meta.dynamicPlanner : {};

  return {
    planId: String(plannerMeta.planId ?? `plan_mission_${missionId}`),
    intent: String(plannerMeta.intent ?? 'general_chat'),
    workflow: String(plannerMeta.workflow ?? 'unknown'),
    steps: proactiveSteps.map((step, idx) => ({
      id: String(step.dynamicStepId ?? `step_${step.step ?? idx + 1}`),
      name: String(step.title ?? `step_${step.step ?? idx + 1}`),
      label: String(step.title ?? `Step ${step.step ?? idx + 1}`),
      type: step.planRole === 'checkpoint' ? 'checkpoint' : 'action',
      tool: typeof step.recommendedTool === 'string' ? step.recommendedTool : null,
      order: step.step ?? idx + 1,
      optional: false,
      dependencies: [],
      estimatedDuration: 3,
      checkpointConfig:
        step.checkpoint && typeof step.checkpoint === 'object' ? step.checkpoint : undefined,
    })),
    metadata: {
      totalSteps: proactiveSteps.length,
      estimatedDuration: proactiveSteps.length * 3,
      requiresSignIn: false,
      requiresStore: false,
      tags: [],
      priority: 3,
    },
    contextSnapshot: {},
    reasoning: [],
    suggestedActions: [],
    generatedAt: new Date().toISOString(),
    version: String(plannerMeta.version ?? '1.0.0'),
  };
}

/**
 * Execute a dynamic plan via the runtime mission orchestrator.
 *
 * @param {Object} options
 * @param {import('./plannerTypes.js').DynamicPlan} options.plan
 * @param {string} options.missionId
 * @param {object} [options.user]
 * @param {Record<string, unknown>} [options.planParameters]
 * @param {number | null} [options.stepNumber]
 * @param {string} [options.source]
 * @param {string | null} [options.traceId]
 * @param {'next' | 'all' | 'until_blocked'} [options.runMode]
 * @param {boolean} [options.materializePipelineSteps]
 */
export async function executeDynamicPlan(options) {
  const plan = options?.plan;
  const missionId = String(options?.missionId ?? '').trim();

  if (!plan?.steps?.length) {
    return {
      ok: false,
      status: 'invalid_plan',
      code: 'INVALID_PLAN',
      message: 'Plan has no steps',
      planId: plan?.planId ?? null,
      missionId: missionId || null,
    };
  }

  if (!missionId) {
    return {
      ok: false,
      status: 'missing_mission',
      code: 'MISSING_MISSION_ID',
      message: 'missionId is required for plan execution',
      planId: plan.planId,
      missionId: null,
    };
  }

  if (!isDynamicPlannerExecutionEnabled()) {
    return {
      ok: false,
      status: 'disabled',
      code: 'EXECUTION_DISABLED',
      message: 'Dynamic plan execution is disabled (ENABLE_DYNAMIC_PLANNER_EXECUTION=false)',
      planId: plan.planId,
      missionId,
      plan,
    };
  }

  const prisma = getPrismaClient();
  const proactivePlanSteps = dynamicPlanToProactivePlanSteps(plan);
  const planParameters =
    options.planParameters && typeof options.planParameters === 'object' && !Array.isArray(options.planParameters)
      ? options.planParameters
      : {};

  const persistResult = await persistDynamicPlanToMission(prisma, missionId, plan, {
    proactivePlanSteps,
    planParameters,
  });
  if (!persistResult.ok) {
    return {
      ok: false,
      status: 'persist_failed',
      code: persistResult.code ?? 'PERSIST_FAILED',
      message: persistResult.message ?? 'Failed to persist plan to mission',
      planId: plan.planId,
      missionId,
    };
  }

  if (options.materializePipelineSteps !== false) {
    await materializeDynamicPlanPipelineSteps(prisma, missionId, plan);
  }

  const stepNumber =
    options.stepNumber != null && Number.isFinite(Number(options.stepNumber))
      ? Math.floor(Number(options.stepNumber))
      : null;
  const targetStep = resolvePlanStepForExecution(plan, stepNumber);

  if (targetStep) {
    try {
      await emitPlanStepStarted(missionId, targetStep, { planId: plan.planId });
    } catch (err) {
      console.warn('[DynamicPlanner] emitPlanStepStarted failed (non-blocking):', err?.message ?? err);
    }
  }

  const orchestratorInput = {
    user: options.user ?? null,
    missionId,
    source: options.source ?? 'dynamic_planner_executor',
    traceId: options.traceId ?? null,
    planSteps: proactivePlanSteps,
    planParameters,
    ...(stepNumber != null ? { stepNumber } : {}),
  };

  const runMode = options.runMode ?? 'next';
  let orchestrator;
  if (runMode === 'all') {
    orchestrator = await runAllAvailableSteps(orchestratorInput);
  } else if (runMode === 'until_blocked') {
    orchestrator = await runMissionUntilNextBlock(orchestratorInput);
  } else {
    orchestrator = await runNextStep(orchestratorInput);
  }

  if (targetStep && orchestrator?.ok !== false) {
    try {
      await emitPlanStepCompleted(
        missionId,
        targetStep,
        {
          orchestrationStatus: orchestrator.orchestrationStatus ?? null,
          stepNumber: orchestrator.stepNumber ?? targetStep.order,
          code: orchestrator.code ?? null,
        },
        { planId: plan.planId },
      );
    } catch (err) {
      console.warn('[DynamicPlanner] emitPlanStepCompleted failed (non-blocking):', err?.message ?? err);
    }
  }

  return {
    ok: orchestrator?.ok !== false,
    status: orchestrator?.ok === false ? 'failed' : 'executed',
    code: orchestrator?.code ?? null,
    message: orchestrator?.message ?? null,
    planId: plan.planId,
    missionId,
    stepNumber: orchestrator?.stepNumber ?? stepNumber ?? targetStep?.order ?? null,
    orchestration: orchestrator,
    proactivePlanSteps,
  };
}
