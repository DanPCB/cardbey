/**
 * Task B — Agent Chat adapter (read-only).
 * Transforms Mission.context.chainPlan → ExecutionMissionPlan-shaped object for UI.
 * Pure function; does not write to Mission.context or change chain plan behavior.
 *
 * Chain plan shape (from MISSION_ENGINE_PHASE_A): chainId, suggestions[], cursor, status?, ...
 * Suggestions: [{ id, agentKey, intent, risk, requiresApproval }]. No dependsOn/blockedBy in
 * chain plan suggestions (verified); dependsOn is therefore [] for all steps (sequential by cursor).
 */

import { STEP_STATUS } from './executionPlanTypes.js';

const CHAIN_STATUS_BLOCKED = 'blocked_error';
const INTENT_TYPE_CHAIN = 'chain_plan';

/** Map chain agentKey to ExecutionMissionPlan agentType */
const AGENT_KEY_TO_TYPE = {
  research: 'ResearchAgent',
  planner: 'PlannerAgent',
  catalog: 'CatalogAgent',
  media: 'MediaAgent',
  copy: 'CopyAgent',
  promotion: 'PromotionAgent',
};

/**
 * Derive step status from cursor and chain status.
 * Steps before cursor = completed; step at cursor = running or failed; steps after = pending.
 *
 * @param {number} index - Step index (0-based)
 * @param {number} cursor - Current step index (0-based)
 * @param {number} length - Total suggestions length
 * @param {string} [chainStatus] - chainPlan.status: 'running' | 'waiting_approval' | 'blocked_error' | 'completed'
 */
function stepStatusFromCursor(index, cursor, length, chainStatus) {
  if (index < cursor) return STEP_STATUS.COMPLETED;
  if (index > cursor) return STEP_STATUS.PENDING;
  // index === cursor
  if (cursor >= length) return STEP_STATUS.COMPLETED; // past end, all done
  if (chainStatus === CHAIN_STATUS_BLOCKED) return STEP_STATUS.FAILED;
  return STEP_STATUS.RUNNING;
}

/**
 * @param {object} [chainPlan] - Mission.context.chainPlan
 * @returns {import('./executionPlanTypes.js').ExecutionMissionPlan}
 */
export function chainPlanToExecutionPlan(chainPlan) {
  if (!chainPlan || typeof chainPlan !== 'object') {
    return {
      planId: '',
      intentType: INTENT_TYPE_CHAIN,
      intentId: '',
      createdAt: '',
      steps: [],
    };
  }

  const suggestions = Array.isArray(chainPlan.suggestions) ? chainPlan.suggestions : [];
  const cursor = typeof chainPlan.cursor === 'number' && chainPlan.cursor >= 0 ? chainPlan.cursor : 0;
  const chainStatus = typeof chainPlan.status === 'string' ? chainPlan.status : '';
  const chainId = (chainPlan.chainId != null && String(chainPlan.chainId)) || '';

  const steps = suggestions.map((s, i) => {
    const agentKey = (s && typeof s.agentKey === 'string') ? s.agentKey.toLowerCase() : '';
    const agentType = AGENT_KEY_TO_TYPE[agentKey] || 'PlannerAgent';
    const label = (s && typeof s.intent === 'string' && s.intent.trim()) ? s.intent.trim() : (s?.agentKey || `Step ${i + 1}`);
    const stepId = (s && (s.id != null)) ? String(s.id) : `step_${i}`;
    const requiresApproval = !!(s && s.requiresApproval);

    return {
      stepId,
      order: i + 1,
      agentType,
      label,
      dependsOn: [],
      checkpoint: requiresApproval,
      status: stepStatusFromCursor(i, cursor, suggestions.length, chainStatus),
    };
  });

  return {
    planId: chainId ? `chain_${chainId}` : '',
    intentType: INTENT_TYPE_CHAIN,
    intentId: chainId,
    createdAt: '', // chain plan does not expose createdAt; UI can use planId for identity
    steps,
  };
}
