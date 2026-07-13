/**
 * Visual + OCR topology fusion — geometry from vision, semantics from OCR.
 */

import { buildLoyaltyCardTopologyFromDetected } from './loyaltyTopologyBuild.js';
import { inferRuleFromTopology } from './loyaltyRuleInference.js';

/**
 * @typedef {import('./loyaltyTopologyTypes.js').LoyaltyCardTopology} LoyaltyCardTopology
 * @typedef {import('./loyaltyTopologyTypes.js').LoyaltyProgramRule} LoyaltyProgramRule
 */

/**
 * @typedef {{
 *   source: string;
 *   confidence: number;
 *   rows?: number | null;
 *   columns?: number | null;
 *   layout?: string | null;
 *   estimatedThreshold?: number | null;
 *   footerText?: string | null;
 *   cardTopology?: LoyaltyCardTopology | null;
 * }} VisualExtractionResult
 */

/**
 * @typedef {{
 *   source: string;
 *   confidence: number;
 *   rows?: number | null;
 *   columns?: number | null;
 *   detectedLayout?: string | null;
 *   stampThreshold?: number | null;
 *   buyGetRule?: { buy: number; get: number } | null;
 *   footerText?: string | null;
 *   purchaseItemHint?: string | null;
 *   rewardItemHint?: string | null;
 *   cardTopology?: LoyaltyCardTopology | null;
 * }} OcrExtractionResult
 */

function pickPositiveInt(...values) {
  for (const value of values) {
    const n = Math.round(Number(value));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/**
 * @param {VisualExtractionResult} visual
 * @param {OcrExtractionResult} ocr
 */
export function calculateFusionConfidence(visual, ocr) {
  let score = 0;
  if (Number(visual.confidence) > 0.8) score += 0.6;
  else if (Number(visual.confidence) > 0.55) score += 0.35;
  if (Number(ocr.confidence) > 0.7) score += 0.3;
  else if (Number(ocr.confidence) > 0.45) score += 0.15;

  const visualLayout = visual.layout ?? (visual.rows && visual.columns ? `${visual.rows}x${visual.columns}` : null);
  const ocrLayout =
    ocr.detectedLayout ?? (ocr.rows && ocr.columns ? `${ocr.rows}x${ocr.columns}` : null);
  if (visualLayout && ocrLayout && visualLayout === ocrLayout) score += 0.1;

  return Math.min(0.95, score);
}

/**
 * Infer purchase/reward columns per row from stamp threshold and grid size.
 *
 * @param {number} rows
 * @param {number} columns
 * @param {number | null} stampThreshold
 */
function inferRowPattern(rows, columns, stampThreshold) {
  const rewardCols = Math.max(1, Math.min(columns - 1, Math.round(rows > 1 ? 1 : columns >= 5 ? 1 : 0) || 1));
  let purchasesPerRow = columns - rewardCols;
  if (stampThreshold && rows > 0) {
    const perRowFromThreshold = Math.max(1, Math.round(stampThreshold / rows));
    if (perRowFromThreshold < purchasesPerRow) purchasesPerRow = perRowFromThreshold;
  }
  return { purchasesPerRow: Math.max(1, purchasesPerRow), rewardCols };
}

/**
 * @param {number} rows
 * @param {number} purchasesPerRow
 * @param {number} rewardCols
 * @param {{ purchaseLabel?: string | null; rewardLabel?: string | null; footerText?: string | null; confidence?: number }} [opts]
 */
function buildDetectedFromPattern(rows, purchasesPerRow, rewardCols, opts = {}) {
  const columns = purchasesPerRow + rewardCols;
  /** @type {import('./loyaltyTopologyTypes.js').DetectedGridTopology['cells']} */
  const cells = [];
  const purchaseLabel = opts.purchaseLabel ?? 'Purchase';
  const rewardLabel = opts.rewardLabel ?? 'Reward';

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const isReward = col >= purchasesPerRow;
      cells.push({
        row,
        column: col,
        role: isReward ? 'REWARD' : 'PURCHASE',
        text: isReward ? rewardLabel : purchaseLabel,
        confidence: opts.confidence ?? 0.88,
      });
    }
  }

  return {
    rows,
    columns,
    cells,
    repeatedPattern: {
      direction: 'ROW',
      roles: [...Array(purchasesPerRow).fill('PURCHASE'), ...Array(rewardCols).fill('REWARD')],
      repetitions: rows,
      confidence: opts.confidence ?? 0.88,
    },
    footerText: opts.footerText ?? undefined,
    purchaseItemHint: purchaseLabel,
    rewardItemHint: rewardLabel,
    overallConfidence: opts.confidence ?? 0.88,
  };
}

/**
 * @param {VisualExtractionResult} visual
 * @param {OcrExtractionResult} ocr
 * @returns {{ topology: LoyaltyCardTopology; rule: LoyaltyProgramRule | null; confidence: number; stampThreshold: number | null }}
 */
export function fuseTopologyResults(visual, ocr) {
  if (visual.cardTopology && Number(visual.confidence) >= 0.55) {
    const rule =
      inferRuleFromTopology(visual.cardTopology, {
        purchaseItem: ocr.purchaseItemHint ?? undefined,
        rewardItem: ocr.rewardItemHint ?? undefined,
      }) ?? null;
    const stampThreshold =
      ocr.stampThreshold ?? visual.estimatedThreshold ?? rule?.purchasesRequired ?? null;
    if (stampThreshold && rule) {
      rule.purchasesRequired = stampThreshold;
    }
    return {
      topology: {
        ...visual.cardTopology,
        source: 'VISION_EXTRACTED',
        footerText: ocr.footerText ?? visual.footerText ?? visual.cardTopology.footerText,
        confidence: Math.max(
          Number(visual.cardTopology.confidence) || 0,
          calculateFusionConfidence(visual, ocr),
        ),
      },
      rule,
      confidence: Math.max(calculateFusionConfidence(visual, ocr), Number(visual.confidence) || 0),
      stampThreshold,
    };
  }

  if (ocr.cardTopology && !visual.rows && Number(ocr.confidence) >= 0.75) {
    const rule =
      inferRuleFromTopology(ocr.cardTopology, {
        purchaseItem: ocr.purchaseItemHint ?? undefined,
        rewardItem: ocr.rewardItemHint ?? undefined,
      }) ?? null;
    return {
      topology: { ...ocr.cardTopology, source: 'VISION_EXTRACTED' },
      rule,
      confidence: calculateFusionConfidence(visual, ocr),
      stampThreshold: ocr.stampThreshold ?? rule?.purchasesRequired ?? null,
    };
  }

  const rows = pickPositiveInt(visual.rows, ocr.rows) ?? 2;
  const columns = pickPositiveInt(visual.columns, ocr.columns) ?? 5;
  let stampThreshold =
    pickPositiveInt(ocr.buyGetRule?.buy, ocr.stampThreshold, visual.estimatedThreshold) ?? null;

  const { purchasesPerRow, rewardCols } = inferRowPattern(rows, columns, stampThreshold);
  if (!stampThreshold) {
    stampThreshold = purchasesPerRow * rows;
  }

  const confidence = Math.max(
    calculateFusionConfidence(visual, ocr),
    visual.rows && visual.columns ? 0.68 : 0,
    ocr.stampThreshold ? 0.62 : 0,
  );
  const detected = buildDetectedFromPattern(rows, purchasesPerRow, rewardCols, {
    purchaseLabel: ocr.purchaseItemHint ?? 'Purchase',
    rewardLabel: ocr.rewardItemHint ?? 'Reward',
    footerText: ocr.footerText ?? visual.footerText ?? undefined,
    confidence: Math.max(confidence, Number(visual.confidence) || 0, Number(ocr.confidence) || 0),
  });

  const topology = buildLoyaltyCardTopologyFromDetected(detected, { source: 'VISION_EXTRACTED' });
  if (!topology) {
    throw new Error('fuseTopologyResults: failed to build topology from fused pattern');
  }

  topology.confidence = Math.max(Number(topology.confidence) || 0, confidence);
  topology.footerText = ocr.footerText ?? visual.footerText ?? topology.footerText;
  topology.source = visual.rows ? 'VISION_EXTRACTED' : 'FUSION_VISUAL_OCR';

  const rule =
    inferRuleFromTopology(topology, {
      purchaseItem: ocr.purchaseItemHint ?? undefined,
      rewardItem: ocr.rewardItemHint ?? undefined,
    }) ?? null;
  if (rule && stampThreshold) {
    rule.purchasesRequired = stampThreshold;
  }

  return { topology, rule, confidence: topology.confidence ?? confidence, stampThreshold };
}
