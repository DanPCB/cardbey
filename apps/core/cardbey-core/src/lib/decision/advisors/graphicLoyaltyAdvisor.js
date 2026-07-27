/**
 * Graphic / loyalty intent advisor.
 */

import { detectPromotionGraphicIntent } from '../../intake/intakeSystemShortcuts.js';
import { isGraphicDesignIntent, isLoyaltyIntent } from '../../intake/intentDetectors.js';
import { createHypothesis, pushHypothesis } from '../hypothesisUtils.js';

/**
 * @param {import('../constants.js').BeliefSnapshot} belief
 * @param {import('../advisorTypes.js').AdvisorInput} input
 * @returns {import('../hypothesisUtils.js').Hypothesis[]}
 */
export function graphicLoyaltyAdvisor(belief, input) {
  const hypotheses = [];
  const userMessage = String(input.originalUserMessage ?? input.userMessage ?? '').trim();
  const storeId = belief.anchors.storeId;

  if (storeId && detectPromotionGraphicIntent(userMessage, storeId)) {
    pushHypothesis(
      hypotheses,
      createHypothesis({
        intent: 'generate_graphic',
        score: 0.93,
        advisorId: 'graphic_loyalty',
        suggestedTool: 'create_promotion_graphic',
        requiredContext: ['store'],
        evidence: [{ source: 'rules', fact: 'promotion_graphic_intent' }],
      }),
    );
  } else if (isGraphicDesignIntent(userMessage)) {
    pushHypothesis(
      hypotheses,
      createHypothesis({
        intent: 'generate_graphic',
        score: 0.8,
        advisorId: 'graphic_loyalty',
        suggestedTool: 'create_promotion_graphic',
        evidence: [{ source: 'rules', fact: 'graphic_design_intent' }],
      }),
    );
  }

  if (storeId && isLoyaltyIntent(userMessage)) {
    pushHypothesis(
      hypotheses,
      createHypothesis({
        intent: 'setup_loyalty',
        score: 0.91,
        advisorId: 'graphic_loyalty',
        suggestedTool: 'setup_loyalty_program',
        requiredContext: ['store'],
        evidence: [{ source: 'rules', fact: 'loyalty_intent' }],
      }),
    );
  }

  return hypotheses;
}
