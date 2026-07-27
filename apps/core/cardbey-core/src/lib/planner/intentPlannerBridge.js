/**
 * Bridge Intent Reasoning results → Dynamic Planner plans.
 */

import { Planner } from './planner.js';
import { DEFAULT_PLANNER_CONFIG } from './constants.js';

/** @type {Planner | null} */
let plannerSingleton = null;

/**
 * @param {Object} [options]
 * @returns {Planner}
 */
export function getDynamicPlanner(options = {}) {
  if (!plannerSingleton || options.forceNew) {
    plannerSingleton = new Planner(options);
  }
  return plannerSingleton;
}

/** @internal tests */
export function resetDynamicPlannerForTests() {
  plannerSingleton = null;
}

/**
 * Whether dynamic planning is enabled.
 */
export function isDynamicPlannerEnabled() {
  return String(process.env.ENABLE_DYNAMIC_PLANNER ?? '').trim().toLowerCase() === 'true';
}

/**
 * Generate a plan from a reasoned intent result.
 *
 * @param {import('../intent/intentTypes.js').IntentReasoningResult} reasoningResult
 * @param {import('../context/contextTypes.js').UserContext | Record<string, unknown>} context
 * @param {Object} [options]
 * @returns {import('./plannerTypes.js').PlanGenerationResult}
 */
export function planFromReasoning(reasoningResult, context, options = {}) {
  const planner = getDynamicPlanner({
    config: {
      ...DEFAULT_PLANNER_CONFIG,
      guestAwareEnabled: options.guestAwareEnabled ?? DEFAULT_PLANNER_CONFIG.guestAwareEnabled,
    },
  });

  return planner.generatePlan(reasoningResult, context, options);
}

/**
 * Reason + plan in one call when both engines are available.
 *
 * @param {import('../intent/intentReasoner.js').IntentReasoner} reasoner
 * @param {string} userId
 * @param {string} sessionId
 * @param {Object} input
 * @param {Record<string, unknown>} [context]
 * @param {Object} [options]
 */
export async function reasonAndPlan(reasoner, userId, sessionId, input, context = {}, options = {}) {
  const reasoningResult = await reasoner.reason(userId, sessionId, input, options);
  const planResult = planFromReasoning(reasoningResult, {
    ...context,
    userId: context.userId ?? userId,
  }, options);

  return {
    reasoning: reasoningResult,
    plan: planResult,
  };
}
