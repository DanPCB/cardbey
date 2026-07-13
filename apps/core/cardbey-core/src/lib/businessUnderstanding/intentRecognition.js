/**
 * Phase 3 — Intent recognition (why the artifact exists).
 */

import { governed } from './confidenceGovernance.js';

/** @typedef {import('./businessUnderstandingTypes.js').BueArtifactType} BueArtifactType */
/** @typedef {import('./businessUnderstandingTypes.js').IntentContract} IntentContract */

/** @type {Record<BueArtifactType, { primary: string; secondary: string[] }>} */
const ARTIFACT_INTENT_MAP = Object.freeze({
  loyalty_card: {
    primary: 'reward_customer',
    secondary: ['promote_repeat_visits', 'build_brand_loyalty'],
  },
  menu: {
    primary: 'provide_menu',
    secondary: ['inform_purchase_decision', 'promote_items'],
  },
  business_card: {
    primary: 'share_contact',
    secondary: ['promote_business', 'establish_credibility'],
  },
  promotion_flyer: {
    primary: 'advertise_offer',
    secondary: ['drive_traffic', 'promote_event'],
  },
  poster: {
    primary: 'advertise_offer',
    secondary: ['build_awareness'],
  },
  voucher: {
    primary: 'issue_voucher',
    secondary: ['drive_redemption', 'reward_customer'],
  },
  coupon: {
    primary: 'advertise_offer',
    secondary: ['drive_redemption'],
  },
  gift_card: {
    primary: 'sell_prepaid_value',
    secondary: ['gift_giving'],
  },
  price_list: {
    primary: 'provide_pricing',
    secondary: ['inform_purchase_decision'],
  },
  product_sheet: {
    primary: 'describe_products',
    secondary: ['support_sales'],
  },
  receipt: {
    primary: 'record_transaction',
    secondary: ['proof_of_purchase'],
  },
  invoice: {
    primary: 'request_payment',
    secondary: ['record_transaction'],
  },
  event_ticket: {
    primary: 'grant_event_access',
    secondary: ['promote_event'],
  },
  unknown: {
    primary: 'unknown_purpose',
    secondary: [],
  },
});

/**
 * @param {{
 *   artifactType: BueArtifactType;
 *   classificationConfidence?: number;
 *   userMessage?: string | null;
 * }} input
 * @returns {IntentContract}
 */
export function recognizeArtifactIntent(input = {}) {
  const artifactType = input.artifactType ?? 'unknown';
  const mapping = ARTIFACT_INTENT_MAP[artifactType] ?? ARTIFACT_INTENT_MAP.unknown;
  const confidence = Math.min(0.95, 0.55 + (Number(input.classificationConfidence) || 0) * 0.4);

  return {
    schema: 'cb-intent',
    version: 'v1',
    primaryIntent: governed(mapping.primary, confidence, 'INFERRED'),
    secondaryIntents: governed(mapping.secondary, confidence * 0.9, 'INFERRED'),
  };
}

export default { recognizeArtifactIntent };
