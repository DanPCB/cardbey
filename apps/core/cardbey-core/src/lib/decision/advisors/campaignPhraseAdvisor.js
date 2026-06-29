/**
 * Campaign phrase advisor.
 */

import { isCampaignOrchestrationIntent } from '../../intent/campaignOrchestrationIntent.js';
import { createHypothesis, pushHypothesis } from '../hypothesisUtils.js';

/**
 * @param {import('../constants.js').BeliefSnapshot} belief
 * @param {import('../advisorTypes.js').AdvisorInput} input
 * @returns {import('../hypothesisUtils.js').Hypothesis[]}
 */
export function campaignPhraseAdvisor(belief, input) {
  const hypotheses = [];
  const userMessage = String(input.originalUserMessage ?? input.userMessage ?? '').trim();

  if (!/campaign|promo(tion)?|marketing/i.test(userMessage) && !isCampaignOrchestrationIntent(userMessage)) {
    return hypotheses;
  }

  const hasStore = Boolean(belief.anchors.storeId || belief.anchors.draftId);
  const score = isCampaignOrchestrationIntent(userMessage) ? 0.9 : 0.82;

  if (hasStore) {
    pushHypothesis(
      hypotheses,
      createHypothesis({
        intent: 'create_campaign',
        score,
        advisorId: 'campaign_phrase',
        suggestedTool: 'create_campaign',
        requiredContext: ['store'],
        evidence: [{ source: 'rules', fact: 'campaign_phrase_with_store' }],
      }),
    );
  } else {
    pushHypothesis(
      hypotheses,
      createHypothesis({
        intent: 'create_store_first',
        score: 0.65,
        advisorId: 'campaign_phrase',
        suggestedTool: 'create_store',
        evidence: [{ source: 'context', fact: 'campaign_without_store' }],
      }),
    );
    pushHypothesis(
      hypotheses,
      createHypothesis({
        intent: 'create_campaign',
        score: 0.45,
        advisorId: 'campaign_phrase',
        suggestedTool: 'create_campaign',
        evidence: [{ source: 'rules', fact: 'campaign_phrase_weak_no_store' }],
      }),
    );
  }

  return hypotheses;
}
