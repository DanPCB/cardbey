/**
 * Reconcile loyalty card topology from deterministic OCR token grids
 * when cached / CV topology disagrees (e.g. CV 2×5 vs OCR 4×8).
 */

import { parseLoyaltyCardTopologyFromOcr } from './loyaltyOcrTopologyParser.js';
import { buildLoyaltyCardTopologyFromDetected } from './loyaltyTopologyBuild.js';
import { inferRuleFromTopology } from './loyaltyRuleInference.js';
import { alignLegacyFieldsWithCanonicalRule } from './loyaltyContractDiagnostics.js';

function layoutString(rows, columns) {
  const r = Number(rows);
  const c = Number(columns);
  if (!Number.isFinite(r) || !Number.isFinite(c) || r <= 0 || c <= 0) return null;
  return `${r}x${c}`;
}

/**
 * @param {{ method?: string; detected?: { overallConfidence?: number } } | null | undefined} parsed
 */
export function isStrongOcrTokenTopology(parsed) {
  if (!parsed?.detected?.rows || !parsed?.detected?.columns) return false;
  const conf = Number(parsed.detected.overallConfidence) || 0;
  const method = String(parsed.method ?? '');
  return conf >= 0.85 && /ocr_token|ocr_stamp_row/i.test(method);
}

/**
 * @param {string | null | undefined} ocrText
 * @param {{ rows?: number; columns?: number } | null | undefined} cardTopology
 */
export function ocrTopologyDisagreesWithCard(ocrText, cardTopology) {
  const parsed = parseLoyaltyCardTopologyFromOcr(ocrText);
  if (!parsed?.detected?.rows || !parsed?.detected?.columns) return false;
  const ocrLayout = layoutString(parsed.detected.rows, parsed.detected.columns);
  const topoLayout = layoutString(cardTopology?.rows, cardTopology?.columns);
  if (!ocrLayout) return false;
  if (!topoLayout) return true;
  return ocrLayout !== topoLayout;
}

/**
 * @param {{ rows?: number; columns?: number } | null | undefined} topology
 * @param {string | null | undefined} ocrText
 */
export function loyaltyTopologyNeedsOcrReconcile(topology, ocrText) {
  const raw = String(ocrText ?? '').trim();
  if (!raw) return false;
  if (!topology?.rows || !topology?.columns) return true;
  return ocrTopologyDisagreesWithCard(raw, topology);
}

/**
 * @param {string | null | undefined} ocrText
 * @param {Record<string, unknown>} [existingDraft]
 */
export function tryReconcileLoyaltyFromOcr(ocrText, existingDraft = {}) {
  const raw = String(ocrText ?? '').trim();
  if (!raw) return null;

  const parsed = parseLoyaltyCardTopologyFromOcr(raw);
  if (!isStrongOcrTokenTopology(parsed) || !parsed?.detected) return null;

  const cardTopology = buildLoyaltyCardTopologyFromDetected(parsed.detected, {
    source: 'VISION_EXTRACTED',
  });
  if (!cardTopology) return null;

  const rule =
    inferRuleFromTopology(cardTopology, {
      purchaseItem: parsed.purchaseItemHint ?? 'Coffee',
      rewardItem: parsed.rewardItemHint ?? 'Free',
    }) ?? null;

  const preseededDraft = alignLegacyFieldsWithCanonicalRule({
    ...existingDraft,
    cardTopology,
    rule,
    reward: rule?.rewardItem ?? existingDraft.reward ?? 'Free coffee',
    requiredStamps: rule?.purchasesRequired ?? existingDraft.requiredStamps ?? null,
    stampThreshold: rule?.purchasesRequired ?? existingDraft.stampThreshold ?? null,
    cardFooterText: cardTopology.footerText ?? existingDraft.cardFooterText ?? null,
    layoutSource: 'VISION_EXTRACTED',
    layoutConfidence: cardTopology.confidence ?? parsed.detected.overallConfidence ?? 0.9,
    topologyExtractionMethod: `ocr_reconcile_${parsed.method}`,
    extractedFromImage: true,
    ocrText: raw,
  });

  return {
    preseededDraft,
    cardTopology,
    rule,
    method: parsed.method,
    layout: layoutString(cardTopology.rows, cardTopology.columns),
  };
}

export default {
  isStrongOcrTokenTopology,
  ocrTopologyDisagreesWithCard,
  loyaltyTopologyNeedsOcrReconcile,
  tryReconcileLoyaltyFromOcr,
};
