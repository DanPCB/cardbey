/**
 * Explicit store creation advisor — wraps storeCreateFastPath.
 */

import { tryStoreCreateFastPath } from '../../intent/storeCreateFastPath.js';
import { createHypothesis, pushHypothesis } from '../hypothesisUtils.js';

/**
 * @param {import('../constants.js').BeliefSnapshot} belief
 * @param {import('../advisorTypes.js').AdvisorInput} input
 * @returns {import('../hypothesisUtils.js').Hypothesis[]}
 */
export function explicitStoreAdvisor(belief, input) {
  const hypotheses = [];
  const userMessage = String(input.originalUserMessage ?? input.userMessage ?? '').trim();

  const fast = tryStoreCreateFastPath(userMessage, {
    storeCreateForm: input.storeCreateForm,
    forceIntent: input.forceIntent,
    currentFlow: input.currentFlow,
    source: input.source,
    activeStoreId: belief.anchors.storeId,
  });

  if (fast?.tool === 'create_store') {
    pushHypothesis(
      hypotheses,
      createHypothesis({
        intent: 'create_store',
        score: typeof fast.confidence === 'number' ? fast.confidence : 0.95,
        advisorId: 'explicit_store',
        suggestedTool: 'create_store',
        evidence: [{ source: 'rules', fact: String(fast._fastPath ?? fast._reason ?? 'store_create_fast_path') }],
      }),
    );
  }

  if (input.shortcutContext?.type === 'create_store') {
    pushHypothesis(
      hypotheses,
      createHypothesis({
        intent: 'create_store',
        score: 0.98,
        advisorId: 'explicit_store',
        suggestedTool: 'create_store',
        evidence: [{ source: 'context', fact: 'shortcut_context_create_store' }],
      }),
    );
  }

  return hypotheses;
}
