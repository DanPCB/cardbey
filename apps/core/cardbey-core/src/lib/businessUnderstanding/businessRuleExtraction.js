/**
 * Phase 4 — Business rule extraction (executable rules, no UI generation).
 */

import { governed } from './confidenceGovernance.js';
import { purchasesRequiredFromRule } from '../loyalty/loyaltyRuleInference.js';

/** @typedef {import('./businessUnderstandingTypes.js').BueArtifactType} BueArtifactType */
/** @typedef {import('./businessUnderstandingTypes.js').BusinessRuleContract} BusinessRuleContract */

function normalizeItemToken(raw, fallback) {
  const text = String(raw ?? '').trim();
  if (!text) return fallback;
  return text.toLowerCase().replace(/\s+/g, '_');
}

/**
 * @param {{
 *   artifactType: BueArtifactType;
 *   rule?: {
 *     purchasesRequired?: number;
 *     purchaseItem?: string;
 *     rewardItem?: string;
 *     rewardQuantity?: number;
 *   } | null;
 *   preseededDraft?: {
 *     requiredStamps?: number;
 *     stampThreshold?: number;
 *     reward?: string;
 *     rule?: Record<string, unknown>;
 *   } | null;
 *   layout?: { purchaseCellCount?: number | null; rewardCellCount?: number | null } | null;
 * }} input
 * @returns {BusinessRuleContract | null}
 */
export function extractBusinessRuleContract(input = {}) {
  const artifactType = input.artifactType ?? 'unknown';
  if (artifactType !== 'loyalty_card' && artifactType !== 'voucher' && artifactType !== 'coupon') {
    return null;
  }

  const rule = input.rule ?? input.preseededDraft?.rule ?? null;
  const purchasesRequired =
    purchasesRequiredFromRule(rule) ??
    (Number(input.preseededDraft?.requiredStamps ?? input.preseededDraft?.stampThreshold) || null);

  if (!purchasesRequired || purchasesRequired < 1) {
    return null;
  }

  const purchaseItem = normalizeItemToken(
    rule?.purchaseItem ?? 'coffee',
    'coffee',
  );
  const rewardItem = normalizeItemToken(
    rule?.rewardItem ?? input.preseededDraft?.reward ?? 'free_item',
    'free_item',
  );
  const rewardQuantity = Math.max(1, Number(rule?.rewardQuantity) || 1);
  const confidence = rule ? 0.88 : 0.72;
  const source = rule ? 'OBSERVED' : 'INFERRED';

  return {
    schema: 'cb-business-rule',
    version: 'v1',
    earningRule: {
      action: 'purchase',
      item: purchaseItem,
      required: purchasesRequired,
      confidence,
      source,
    },
    reward: {
      type: 'free_item',
      item: rewardItem,
      quantity: rewardQuantity,
      confidence,
      source,
    },
    rawRuleSummary: governed(
      `Collect ${purchasesRequired} ${purchaseItem.replace(/_/g, ' ')} · receive ${rewardQuantity} ${rewardItem.replace(/_/g, ' ')}`,
      confidence,
      source,
    ),
  };
}

export default { extractBusinessRuleContract };
