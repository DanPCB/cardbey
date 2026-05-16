/**
 * Run one Operator step with Agent Chat integration: ensure thread exists, then run rule-based step.
 * v1: no LLM tool choice; state summary can be posted to thread later. This just creates thread and runs runOperatorStep.
 */

import { loadOperatorState, saveOperatorState } from './operatorState.js';
import { runOperatorStep } from './runOperatorStep.js';
import { createThreadForMission } from './threadForMission.js';

/**
 * Run one operator step; ensure MissionRun has an agent thread (ConversationThread) for "Advanced view".
 * @param {string} missionRunId
 * @returns {Promise<import('./operatorState.js').OperatorState|null>}
 */
export async function runOperatorStepWithAgents(missionRunId) {
  const state = await loadOperatorState(missionRunId);
  if (!state) return null;
  if (state.status !== 'running') return state;

  let nextState = state;

  if (!state.agentThreadId && state.userId && state.missionId) {
    const created = await createThreadForMission({
      missionId: state.missionId,
      userId: state.userId,
      tenantId: state.tenantId,
      title: `Operator: ${state.missionType}`,
    });
    if (created?.threadId) {
      await saveOperatorState(missionRunId, { agentThreadId: created.threadId });
      nextState = await loadOperatorState(missionRunId);
    }
  }

  return runOperatorStep(missionRunId);
}
