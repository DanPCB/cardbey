/**
 * Unified execution plans from mission context (keyed by intentId).
 */

import { chainPlanToExecutionPlan } from './chainPlanToExecutionPlan.js';

/**
 * Returns all execution plans from mission context as an array.
 * Includes:
 * - orchestra plans from context.missionPlan (skipping malformed entries)
 * - optional chain plan adapted via chainPlanToExecutionPlan
 *
 * @param {{
 *   missionPlan?: Record<string, import('./executionPlanTypes.js').ExecutionMissionPlan | null>,
 *   chainPlan?: object | null
 * } | undefined} missionContext
 * @returns {import('./executionPlanTypes.js').ExecutionMissionPlan[]}
 */
export function getUnifiedExecutionPlans(missionContext) {
  if (!missionContext || typeof missionContext !== 'object') return [];

  const plans = [];

  const missionPlan = missionContext.missionPlan && typeof missionContext.missionPlan === 'object'
    ? missionContext.missionPlan
    : {};

  for (const plan of Object.values(missionPlan)) {
    if (!plan || typeof plan !== 'object') continue;
    if (!Array.isArray(plan.steps)) continue;
    plans.push(plan);
  }

  if (missionContext.chainPlan && typeof missionContext.chainPlan === 'object') {
    const chain = chainPlanToExecutionPlan(missionContext.chainPlan);
    if (Array.isArray(chain.steps) && chain.steps.length > 0) {
      plans.push(chain);
    }
  }

  // Sort most recent first by createdAt; chain plans have empty createdAt and sort last.
  plans.sort((a, b) => {
    const at = (a?.createdAt && typeof a.createdAt === 'string') ? a.createdAt : '';
    const bt = (b?.createdAt && typeof b.createdAt === 'string') ? b.createdAt : '';
    if (!at && !bt) return 0;
    if (!at) return 1;
    if (!bt) return -1;
    return bt.localeCompare(at);
  });

  return plans;
}
