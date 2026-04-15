/**
 * Phase 0: canonical planning entry. Default shadow=true — no pipeline creation in production paths.
 */

import { planMissionFromIntent } from '../agentPlanner.js';
import { shouldOfferLlmTaskGraph } from '../missionPlan/intentPipelineRegistry.js';
import { normalizeCanonicalIntent } from './intentSchema.js';
import { hashInput, hashPlanSummary, logIntentPlanTelemetry } from './intentTelemetry.js';
import { recordIntentPlanEvent } from './missionConsoleTelemetryStore.js';

/**
 * @param {object|null|undefined} missionPlan
 * @param {boolean} hasTaskGraph
 */
function buildPlanSummary(missionPlan, hasTaskGraph) {
  if (!missionPlan || typeof missionPlan !== 'object') return null;
  return {
    missionType: missionPlan.missionType ?? null,
    title: missionPlan.title ?? null,
    targetType: missionPlan.targetType ?? null,
    targetId: missionPlan.targetId ?? null,
    requiresConfirmation: Boolean(missionPlan.requiresConfirmation),
    hasTaskGraph: Boolean(hasTaskGraph),
  };
}

/**
 * @param {object} partialIntent — passed to normalizeCanonicalIntent
 * @param {{
 *   shadow?: boolean,
 *   includeLlmTaskGraph?: boolean,
 *   tenantKey?: string,
 *   allowPipelineCreate?: boolean,
 *   prisma?: import('@prisma/client').PrismaClient|null,
 * }} [options]
 */
export async function executeIntent(partialIntent, options = {}) {
  const {
    shadow = true,
    includeLlmTaskGraph = false,
    tenantKey = 'execute_intent',
    allowPipelineCreate = false,
    prisma = null,
  } = options;

  const normalized = normalizeCanonicalIntent(partialIntent);
  const inputHash = hashInput(normalized.rawInput);

  if (!normalized.rawInput) {
    const planHash = hashPlanSummary(null);
    const emptyPayload = {
      source: normalized.source,
      inputHash,
      planHash,
      missionType: null,
      correlationId: normalized.correlationId,
      ok: false,
      code: 'EMPTY_INPUT',
    };
    recordIntentPlanEvent(emptyPayload);
    logIntentPlanTelemetry(emptyPayload);
    return { ok: false, code: 'EMPTY_INPUT', shadow, planSummary: null };
  }

  const planned = planMissionFromIntent({
    intent: normalized.rawInput,
    context: normalized.context,
  });

  let taskGraph = null;
  let taskGraphSource = null;
  if (
    includeLlmTaskGraph &&
    planned.ok &&
    planned.missionPlan &&
    shouldOfferLlmTaskGraph(planned.missionPlan.missionType)
  ) {
    try {
      const { planTaskGraphForIntent } = await import('../agentPlanning/llmTaskPlanner.js');
      const graphRes = await planTaskGraphForIntent({
        intentType: planned.missionPlan.missionType,
        context: { ...normalized.context, storeId: planned.missionPlan.targetId },
        tenantKey,
      });
      if (graphRes.ok && graphRes.taskGraph) {
        taskGraph = graphRes.taskGraph;
        taskGraphSource = graphRes.source;
      }
    } catch {
      // Phase 0: optional LLM graph must not break shadow path
    }
  }

  const missionPlan = planned.ok ? planned.missionPlan : null;
  const planSummary = buildPlanSummary(missionPlan, Boolean(taskGraph));
  const planHash = hashPlanSummary(planSummary);

  const planPayload = {
    source: normalized.source,
    inputHash,
    planHash,
    missionType: planSummary?.missionType ?? null,
    correlationId: normalized.correlationId,
    ok: planned.ok,
    code: planned.ok ? undefined : planned.reason,
  };
  recordIntentPlanEvent(planPayload);
  logIntentPlanTelemetry(planPayload);

  if (shadow) {
    return {
      ok: planned.ok,
      shadow: true,
      planSummary,
      reason: planned.reason,
    };
  }

  if (!planned.ok) {
    return { ok: false, shadow: false, planSummary: null, reason: planned.reason };
  }

  if (allowPipelineCreate && prisma) {
    const { createMissionPipeline } = await import('../missionPipelineService.js');
    const mp = planned.missionPlan;
    const meta = { ...(mp.metadata && typeof mp.metadata === 'object' ? mp.metadata : {}) };
    if (taskGraph) {
      meta.taskGraph = taskGraph;
      meta.taskGraphSource = taskGraphSource;
    }
    const tenantId =
      typeof normalized.context.tenantId === 'string' ? normalized.context.tenantId : null;
    const createdBy =
      typeof normalized.context.userId === 'string' ? normalized.context.userId : null;
    const created = await createMissionPipeline({
      type: mp.missionType,
      title: mp.title,
      targetType: mp.targetType,
      targetId: mp.targetId,
      targetLabel: mp.targetLabel,
      metadata: meta,
      requiresConfirmation: mp.requiresConfirmation,
      tenantId,
      createdBy,
    });
    return { ok: true, shadow: false, planSummary, pipelineId: created.id };
  }

  return { ok: true, shadow: false, planSummary, pipelineId: null };
}
