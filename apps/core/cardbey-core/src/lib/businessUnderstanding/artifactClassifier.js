/**
 * Phase 1 — Artifact classification before layout analysis.
 */

import { classifyUploadedAssetType } from '../intake/assetIntentIngestService.js';
import { clampConfidence } from './confidenceGovernance.js';

/** @typedef {import('./businessUnderstandingTypes.js').BueArtifactType} BueArtifactType */
/** @typedef {import('./businessUnderstandingTypes.js').ArtifactClassification} ArtifactClassification */

const ASSET_TO_BUE = Object.freeze({
  business_card: 'business_card',
  loyalty_card: 'loyalty_card',
  menu: 'menu',
  flyer: 'promotion_flyer',
  brochure: 'promotion_flyer',
  price_list: 'price_list',
  product_catalog: 'product_sheet',
  invoice: 'invoice',
  contract: 'unknown',
  storefront_photo: 'poster',
  general_document: 'unknown',
  unknown: 'unknown',
});

const KEYWORD_HINTS = [
  { pattern: /\b(loyalty|stamp|rewards?)\b/i, type: 'loyalty_card', weight: 0.35 },
  { pattern: /\b(menu|breakfast|lunch|dinner)\b/i, type: 'menu', weight: 0.3 },
  { pattern: /\b(voucher|redeem)\b/i, type: 'voucher', weight: 0.3 },
  { pattern: /\b(coupon|discount|% off)\b/i, type: 'coupon', weight: 0.3 },
  { pattern: /\b(gift card|giftcard)\b/i, type: 'gift_card', weight: 0.3 },
  { pattern: /\b(receipt|paid|total)\b/i, type: 'receipt', weight: 0.25 },
  { pattern: /\b(invoice|tax invoice)\b/i, type: 'invoice', weight: 0.25 },
  { pattern: /\b(ticket|admit one|event)\b/i, type: 'event_ticket', weight: 0.25 },
  { pattern: /\b(flyer|poster|promo)\b/i, type: 'promotion_flyer', weight: 0.25 },
  { pattern: /\b(price list|pricing)\b/i, type: 'price_list', weight: 0.25 },
];

/**
 * @param {string | null | undefined} assetType
 * @returns {BueArtifactType}
 */
export function mapAssetTypeToBue(assetType) {
  const key = String(assetType ?? 'unknown').trim();
  return /** @type {BueArtifactType} */ (ASSET_TO_BUE[key] ?? 'unknown');
}

/**
 * @param {string} text
 * @returns {Map<BueArtifactType, number>}
 */
function scoreTextHints(text) {
  /** @type {Map<BueArtifactType, number>} */
  const scores = new Map();
  const body = String(text ?? '');
  for (const hint of KEYWORD_HINTS) {
    if (!hint.pattern.test(body)) continue;
    scores.set(hint.type, (scores.get(hint.type) ?? 0) + hint.weight);
  }
  return scores;
}

/**
 * @param {Map<BueArtifactType, number>} scores
 * @param {BueArtifactType} primary
 * @param {number} primaryScore
 */
function buildAlternatives(scores, primary, primaryScore) {
  return [...scores.entries()]
    .filter(([type]) => type !== primary)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([artifactType, score]) => ({
      artifactType,
      confidence: clampConfidence(score / Math.max(primaryScore, 0.01)),
    }));
}

/**
 * @param {{
 *   filename?: string | null;
 *   mimeType?: string | null;
 *   ocrText?: string | null;
 *   userMessage?: string | null;
 *   visualHints?: string[];
 *   priorArtifactType?: string | null;
 * }} input
 * @returns {ArtifactClassification}
 */
export function classifyArtifact(input = {}) {
  const filename = input.filename ?? null;
  const mimeType = input.mimeType ?? null;
  const ocrText = String(input.ocrText ?? '').trim();
  const userMessage = String(input.userMessage ?? '').trim();
  const combinedText = `${ocrText}\n${userMessage}`.trim();

  const assetType = classifyUploadedAssetType({
    filename,
    mimeType,
    ocrHints: ocrText ? { rawText: ocrText } : null,
  });
  let primary = mapAssetTypeToBue(input.priorArtifactType ?? assetType);

  const visualHints = Array.isArray(input.visualHints) ? input.visualHints : [];

  /** @type {Map<BueArtifactType, number>} */
  const scores = new Map();
  scores.set(primary, 0.55);

  if (visualHints.includes('stamp_grid') || visualHints.includes('reward_program_candidate')) {
    scores.set('loyalty_card', Math.max(scores.get('loyalty_card') ?? 0, 0.9));
  }

  for (const [type, weight] of scoreTextHints(combinedText)) {
    scores.set(type, (scores.get(type) ?? 0) + weight);
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  if (ranked.length > 0) {
    primary = ranked[0][0];
  }
  const primaryScore = ranked[0]?.[1] ?? 0.55;
  const confidence = clampConfidence(0.45 + Math.min(0.5, primaryScore));

  return {
    artifactType: primary,
    confidence,
    possibleAlternatives: buildAlternatives(scores, primary, primaryScore),
    classifiedAt: new Date().toISOString(),
    method: 'bue_artifact_classifier_v1',
  };
}

export default { classifyArtifact, mapAssetTypeToBue };
