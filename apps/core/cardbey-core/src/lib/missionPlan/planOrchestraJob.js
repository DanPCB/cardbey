/**
 * Orchestra job execution plan (Foundation 1).
 * Returns ExecutionMissionPlan for a given entryPoint; used to populate Mission.context.missionPlan[jobId].
 * Pure function: no DB reads.
 */

import { AGENT_TYPE, DEFAULT_STEP_STATUS } from './executionPlanTypes.js';

/**
 * build_store: four steps per implementation plan §2.2 Task A.
 */
function buildStoreSteps() {
  return [
    { stepId: 'research', order: 1, agentType: AGENT_TYPE.RESEARCH_AGENT, label: 'Analysing store input', dependsOn: [], checkpoint: false, status: DEFAULT_STEP_STATUS },
    { stepId: 'catalog', order: 2, agentType: AGENT_TYPE.CATALOG_AGENT, label: 'Building product catalogue', dependsOn: [], checkpoint: false, status: DEFAULT_STEP_STATUS },
    { stepId: 'media', order: 3, agentType: AGENT_TYPE.MEDIA_AGENT, label: 'Generating store visuals', dependsOn: [], checkpoint: false, status: DEFAULT_STEP_STATUS },
    { stepId: 'copy', order: 4, agentType: AGENT_TYPE.COPY_AGENT, label: 'Writing product descriptions', dependsOn: [], checkpoint: true, status: DEFAULT_STEP_STATUS },
  ];
}

/**
 * Single-step placeholder for entry points that don't have a multi-step mapping yet.
 */
function singleStepPlan(entryPoint, label) {
  return [
    { stepId: 'run', order: 1, agentType: AGENT_TYPE.PLANNER_AGENT, label: label || `Run ${entryPoint}`, dependsOn: [], checkpoint: false, status: DEFAULT_STEP_STATUS },
  ];
}

/**
 * @param {string} entryPoint - e.g. 'build_store', 'fix_catalog', 'generate_tags'
 * @param {object} [request] - task.request (goal, rawInput, generationRunId, storeId, productIds, etc.)
 * @param {string} jobId - OrchestratorTask.id (used as intentId and for planId)
 * @returns {import('./executionPlanTypes.js').ExecutionMissionPlan}
 */
export function planOrchestraJob(entryPoint, request, jobId) {
  const ep = (entryPoint || '').toLowerCase();
  const intentId = jobId || '';
  const planId = intentId ? `orchestra_${intentId}` : '';
  const now = new Date().toISOString();

  let steps;
  if (ep === 'build_store') {
    steps = buildStoreSteps();
  } else {
    const label = ep ? ep.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Orchestra job';
    steps = singleStepPlan(ep, label);
  }

  return {
    planId,
    intentType: ep || 'orchestra',
    intentId,
    createdAt: now,
    steps,
  };
}
