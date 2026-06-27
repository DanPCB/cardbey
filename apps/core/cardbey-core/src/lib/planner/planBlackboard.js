/**
 * Emit dynamic plan steps to the mission blackboard for UI projection.
 */

import { EXECUTION_EVENT_TYPES } from '../execution/executionNotificationSchema.js';
import { createOrchestrationBlackboard } from '../orchestration/blackboardWriteBuffer.js';

/**
 * @param {string} missionId
 * @param {import('./plannerTypes.js').DynamicPlan} plan
 * @param {{ blackboard?: ReturnType<typeof createOrchestrationBlackboard> }} [options]
 */
export async function emitPlanToBlackboard(missionId, plan, options = {}) {
  const mid = String(missionId ?? '').trim();
  if (!mid || !plan) return { emitted: 0 };

  const blackboard = options.blackboard ?? createOrchestrationBlackboard(mid);

  await blackboard.appendEvent(mid, EXECUTION_EVENT_TYPES.STARTED, {
    missionId: mid,
    planId: plan.planId,
    intent: plan.intent,
    workflow: plan.workflow,
    totalSteps: plan.metadata.totalSteps,
    estimatedDuration: plan.metadata.estimatedDuration,
    source: 'dynamic_planner',
  });

  let emitted = 1;

  for (const step of plan.steps) {
    const payload = {
      missionId: mid,
      planId: plan.planId,
      stepId: step.id,
      stepName: step.name,
      label: step.label,
      labels: step.labels ?? { en: step.label },
      type: step.type,
      order: step.order,
      tool: step.tool,
      optional: step.optional,
      dependencies: step.dependencies,
      estimatedDuration: step.estimatedDuration,
      guestBehavior: step.guestBehavior ?? null,
      checkpoint: step.checkpointConfig ?? null,
      source: 'dynamic_planner',
    };

    if (step.type === 'checkpoint') {
      await blackboard.appendEvent(mid, EXECUTION_EVENT_TYPES.CHECKPOINT_AWAITING, payload);
    } else {
      await blackboard.appendEvent(mid, 'plan.step.preview', payload);
    }
    emitted += 1;
  }

  if (typeof blackboard.flushOrchestrationEvents === 'function') {
    await blackboard.flushOrchestrationEvents();
  }

  return { emitted, planId: plan.planId };
}

/**
 * @param {string} missionId
 * @param {import('./plannerTypes.js').PlanStep} step
 * @param {Record<string, unknown>} [result]
 * @param {{ blackboard?: ReturnType<typeof createOrchestrationBlackboard>; planId?: string }} [options]
 */
export async function emitPlanStepStarted(missionId, step, options = {}) {
  const mid = String(missionId ?? '').trim();
  if (!mid || !step) return null;

  const blackboard = options.blackboard ?? createOrchestrationBlackboard(mid);
  return blackboard.appendEvent(mid, EXECUTION_EVENT_TYPES.STEP_STARTED, {
    missionId: mid,
    planId: options.planId ?? null,
    stepId: step.id,
    stepName: step.name,
    label: step.label,
    tool: step.tool,
    order: step.order,
    source: 'dynamic_planner',
  });
}

/**
 * @param {string} missionId
 * @param {import('./plannerTypes.js').PlanStep} step
 * @param {Record<string, unknown>} [result]
 * @param {{ blackboard?: ReturnType<typeof createOrchestrationBlackboard>; planId?: string }} [options]
 */
export async function emitPlanStepCompleted(missionId, step, result = {}, options = {}) {
  const mid = String(missionId ?? '').trim();
  if (!mid || !step) return null;

  const blackboard = options.blackboard ?? createOrchestrationBlackboard(mid);
  return blackboard.appendEvent(mid, EXECUTION_EVENT_TYPES.STEP_COMPLETED, {
    missionId: mid,
    planId: options.planId ?? null,
    stepId: step.id,
    stepName: step.name,
    label: step.label,
    tool: step.tool,
    order: step.order,
    result,
    source: 'dynamic_planner',
  });
}
