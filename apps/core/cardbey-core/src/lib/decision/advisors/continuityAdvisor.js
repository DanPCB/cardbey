/**
 * Continuity advisor — boosts from belief (pending clarify, active goal, mission).
 */

import { createHypothesis, pushHypothesis } from '../hypothesisUtils.js';
import { isUploadPendingConfirmationWorkflow } from '../uploadBeliefContext.js';

/**
 * @param {import('../constants.js').BeliefSnapshot} belief
 * @param {import('../advisorTypes.js').AdvisorInput} input
 * @returns {import('../hypothesisUtils.js').Hypothesis[]}
 */
export function continuityAdvisor(belief, input) {
  const hypotheses = [];
  const userMessage = String(input.originalUserMessage ?? input.userMessage ?? '').trim().toLowerCase();

  if (belief.pendingClarify?.type === 'upload_goal' && belief.lastUpload) {
    const affirm = /^(yes|yep|yeah|ok|okay|sure|do that|go ahead|create store|the first)/i.test(userMessage);
    if (affirm) {
      pushHypothesis(
        hypotheses,
        createHypothesis({
          intent: 'create_store_from_upload',
          score: 0.9,
          advisorId: 'continuity',
          suggestedTool: 'create_store',
          evidence: [{ source: 'context', fact: 'pending_upload_clarify_affirmation' }],
        }),
      );
    }
  }

  if (belief.activeGoal?.intent) {
    const boost = typeof belief.activeGoal.confidence === 'number' ? belief.activeGoal.confidence * 0.85 : 0.75;
    pushHypothesis(
      hypotheses,
      createHypothesis({
        intent: belief.activeGoal.intent,
        score: boost,
        advisorId: 'continuity',
        evidence: [{ source: 'context', fact: 'active_goal_continuity' }],
      }),
    );
  }

  if (belief.anchors.missionId && !userMessage) {
    pushHypothesis(
      hypotheses,
      createHypothesis({
        intent: 'continue_workflow',
        score: 0.7,
        advisorId: 'continuity',
        evidence: [{ source: 'context', fact: 'active_mission_no_message' }],
      }),
    );
  }

  if (
    isUploadPendingConfirmationWorkflow(belief.workflow) &&
    belief.lastUpload
  ) {
    pushHypothesis(
      hypotheses,
      createHypothesis({
        intent: 'analyze_asset',
        score: 0.72,
        advisorId: 'continuity',
        suggestedTool: 'ingest_asset_for_intent_detection',
        evidence: [{ source: 'context', fact: 'workflow_pending_confirmation' }],
      }),
    );
  }

  return hypotheses;
}
