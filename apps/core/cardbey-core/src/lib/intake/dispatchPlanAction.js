/**
 * Memory-aware dispatch planning for intake (backend port of dashboard planAction).
 */

import { collectLearnedSignals, hasLearnedSignal, MEMORY_SIGNAL_KEYS } from './dispatchMemorySignals.js';

/**
 * @param {string} action
 * @param {Record<string, unknown>} params
 * @param {string} reason
 * @param {number} [priority]
 */
function advisoryStep(action, params, reason, priority = 0) {
  return { action, params, reason, priority, executable: false };
}

/**
 * @param {{
 *   intentType: string;
 *   parameters?: Record<string, unknown>;
 *   storeId?: string | null;
 *   memoryBundle?: Record<string, unknown> | null;
 * }} input
 */
export async function planAction(input = {}) {
  const intentType = String(input.intentType ?? '').trim();
  const parameters =
    input.parameters && typeof input.parameters === 'object' && !Array.isArray(input.parameters)
      ? input.parameters
      : {};
  const storeId = String(input.storeId ?? parameters.storeId ?? '').trim() || null;
  const storeParams = storeId ? { storeId } : {};
  const bundle = input.memoryBundle ?? null;
  const reasoning = [];
  const steps = [];
  const sessionSignals = collectLearnedSignals(bundle);
  const businessSignals =
    bundle?.business &&
    typeof bundle.business === 'object' &&
    Array.isArray(bundle.business.learnedSignals)
      ? bundle.business.learnedSignals
      : [];

  if (
    hasLearnedSignal(sessionSignals, MEMORY_SIGNAL_KEYS.EXIT_INTENT) &&
    intentType === 'launch_campaign'
  ) {
    return {
      steps: [
        {
          action: 'analyze_engagement',
          params: { ...parameters, ...storeParams },
          priority: 0,
          executable: true,
          reason: 'Exit intent detected - fast-path engagement analysis',
        },
      ],
      metadata: { memoryUsed: true, reasoning: ['Fast-path plan for exit_intent session signal'] },
    };
  }

  if (
    hasLearnedSignal(businessSignals, MEMORY_SIGNAL_KEYS.LOW_ENGAGEMENT) &&
    intentType === 'launch_campaign'
  ) {
    steps.push(
      advisoryStep(
        'analyze_engagement',
        storeParams,
        'Low engagement detected - analyzing before launching campaign',
      ),
    );
    reasoning.push('Added analyze_engagement pre-step for low_engagement signal');
  }

  if (
    hasLearnedSignal(businessSignals, MEMORY_SIGNAL_KEYS.PROFILE_INCOMPLETE) &&
    intentType === 'publish_store'
  ) {
    steps.push(
      advisoryStep('complete_profile', storeParams, 'Profile incomplete - complete before publishing'),
    );
    reasoning.push('Added complete_profile pre-step for profile_incomplete signal');
  }

  if (
    hasLearnedSignal(businessSignals, MEMORY_SIGNAL_KEYS.CAMPAIGN_FAILED_RECENTLY) &&
    intentType === 'launch_campaign'
  ) {
    steps.push(
      advisoryStep(
        'review_failed_campaign',
        storeParams,
        'Previous campaign failed - reviewing before retry',
      ),
    );
    reasoning.push('Added review_failed_campaign pre-step after recent campaign failure');
  }

  steps.push({
    action: intentType,
    params: { ...parameters, ...storeParams },
    priority: 1,
    executable: true,
  });

  return {
    steps,
    metadata: {
      memoryUsed: Boolean(bundle),
      reasoning,
    },
  };
}

/**
 * Convert dispatch plan steps into intake proactive plan rows.
 *
 * @param {Awaited<ReturnType<typeof planAction>>} plan
 */
export function dispatchPlanToIntakeSteps(plan) {
  const steps = Array.isArray(plan?.steps) ? plan.steps : [];
  return steps.map((step, index) => ({
    step: index + 1,
    title: step.action,
    description: step.reason ?? step.action,
    recommendedTool: step.action,
    planRole: step.executable === false ? 'advisory' : index === steps.length - 1 ? 'final' : 'prerequisite',
  }));
}

/**
 * Prepend memory-aware advisory steps to an existing classification plan.
 *
 * @param {Record<string, unknown>} classification
 * @param {{ memoryBundle?: Record<string, unknown> | null; storeId?: string | null }} ctx
 */
export async function enrichClassificationWithMemoryPlan(classification, ctx = {}) {
  const tool = String(classification?.tool ?? '').trim();
  if (!tool || classification?.executionPath !== 'proactive_plan') {
    return classification;
  }

  const plan = await planAction({
    intentType: tool,
    parameters:
      classification.parameters && typeof classification.parameters === 'object'
        ? classification.parameters
        : {},
    storeId: ctx.storeId ?? null,
    memoryBundle: ctx.memoryBundle ?? null,
  });

  const advisorySteps = dispatchPlanToIntakeSteps({
    steps: plan.steps.filter((s) => s.executable === false),
    metadata: plan.metadata,
  });

  if (advisorySteps.length === 0) {
    return {
      ...classification,
      _dispatchPlan: plan,
    };
  }

  const existing = Array.isArray(classification.plan) ? classification.plan : [];
  const merged = [...advisorySteps, ...existing];
  return {
    ...classification,
    plan: merged,
    _dispatchPlan: plan,
    _memoryPlanReasoning: plan.metadata?.reasoning ?? [],
  };
}
