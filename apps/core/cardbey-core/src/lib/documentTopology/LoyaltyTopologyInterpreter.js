/**
 * Loyalty interpreter — first production DocumentTopology consumer.
 */

import { buildLoyaltyCardTopologyFromDetected } from '../loyalty/loyaltyTopologyBuild.js';
import { inferRuleFromTopology } from '../loyalty/loyaltyRuleInference.js';
import { registerDocumentInterpreter } from './DocumentInterpreterRegistry.js';

/**
 * @param {import('./documentTopologyTypes.js').DetectedDocumentGrid} detected
 * @param {Record<string, unknown>} [opts]
 */
export function buildLoyaltyTopologyFromDetected(detected, opts = {}) {
  return buildLoyaltyCardTopologyFromDetected(detected, {
    source: opts.source ?? 'VISION_EXTRACTED',
  });
}

/**
 * @param {import('../loyalty/loyaltyTopologyTypes.js').LoyaltyCardTopology} topology
 * @param {Record<string, unknown>} [hints]
 */
export function inferLoyaltyRuleFromTopology(topology, hints = {}) {
  return inferRuleFromTopology(topology, {
    purchaseItem: typeof hints.purchaseItemHint === 'string' ? hints.purchaseItemHint : hints.purchaseItem,
    rewardItem: typeof hints.rewardItemHint === 'string' ? hints.rewardItemHint : hints.rewardItem,
  });
}

/** @type {import('./DocumentInterpreterRegistry.js').DocumentInterpreter} */
export const loyaltyTopologyInterpreter = {
  documentType: 'LOYALTY_CARD',
  buildTopologyFromDetected: buildLoyaltyTopologyFromDetected,
  inferBusinessRule: inferLoyaltyRuleFromTopology,
};

registerDocumentInterpreter(loyaltyTopologyInterpreter);

export default loyaltyTopologyInterpreter;
