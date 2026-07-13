/**
 * Serialize loyalty rule + topology for Prisma persistence.
 */

import { purchasesRequiredFromRule } from '../../loyalty/loyaltyRuleInference.js';

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

/**
 * @param {Record<string, unknown>} draft
 */
export function resolveLoyaltyPersistencePayload(draft = {}) {
  const rule = draft.rule && typeof draft.rule === 'object' ? draft.rule : null;
  const cardTopology =
    draft.cardTopology && typeof draft.cardTopology === 'object' ? draft.cardTopology : null;

  const fromRule = purchasesRequiredFromRule(rule);
  const stampsRequired =
    fromRule ??
    Math.max(1, Number(draft.stampThreshold ?? draft.requiredStamps) || 9);

  const reward = pickString(
    rule?.rewardItem,
    draft.reward,
    draft.rewardRule,
    '1 free item',
  );

  return {
    name: pickString(draft.programName, 'Loyalty Rewards'),
    stampsRequired,
    reward,
    ruleJson: rule ?? null,
    cardTopologyJson: cardTopology ?? null,
    layoutSource: pickString(draft.layoutSource, cardTopology?.source) || null,
    layoutConfidence:
      Number(draft.layoutConfidence ?? cardTopology?.confidence) || null,
    layoutReviewedAt: draft.layoutReviewedAt ?? null,
    layoutReviewedBy: pickString(draft.layoutReviewedBy) || null,
  };
}

export default { resolveLoyaltyPersistencePayload };
