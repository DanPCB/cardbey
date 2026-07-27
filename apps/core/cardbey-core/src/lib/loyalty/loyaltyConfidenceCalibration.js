/**
 * Disagreement-based confidence — contradictory signals cannot all report confidence 1.
 */

/**
 * @typedef {{
 *   visualConfidence: number;
 *   semanticConfidence: number;
 *   patternConsistency: number;
 *   signalAgreement: number;
 *   overallConfidence: number;
 *   reviewRequired: boolean;
 *   disagreements: string[];
 * }} LoyaltyConfidenceSummary
 */

function clamp01(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

/**
 * @param {{
 *   visualGridEvidence?: { rows?: number; columns?: number; confidence?: number; repeatedRowPattern?: boolean } | null;
 *   semanticTextEvidence?: { ocrRowEstimate?: number | null; confidence?: number } | null;
 *   cardTopology?: { rows?: number; columns?: number; confidence?: number; reviewRequired?: boolean } | null;
 *   ocrInferredRows?: number | null;
 *   ocrInferredColumns?: number | null;
 * }} input
 * @returns {LoyaltyConfidenceSummary}
 */
export function calibrateLoyaltyEvidenceConfidence(input = {}) {
  const visual = input.visualGridEvidence ?? null;
  const semantic = input.semanticTextEvidence ?? null;
  const topology = input.cardTopology ?? null;

  const visualRows = Math.max(0, Math.round(Number(visual?.rows ?? topology?.rows) || 0));
  const visualCols = Math.max(0, Math.round(Number(visual?.columns ?? topology?.columns) || 0));
  const ocrRows =
    input.ocrInferredRows != null
      ? Math.max(0, Math.round(Number(input.ocrInferredRows) || 0))
      : semantic?.ocrRowEstimate != null
        ? Math.max(0, Math.round(Number(semantic.ocrRowEstimate) || 0))
        : null;
  const ocrCols =
    input.ocrInferredColumns != null
      ? Math.max(0, Math.round(Number(input.ocrInferredColumns) || 0))
      : null;

  const disagreements = [];

  if (visualRows > 0 && ocrRows != null && ocrRows > 0 && visualRows !== ocrRows) {
    disagreements.push('OCR row count differs from visual grid row count');
  }
  if (visualCols > 0 && ocrCols != null && ocrCols > 0 && visualCols !== ocrCols) {
    disagreements.push('OCR column count differs from visual grid column count');
  }

  const visualConfidence = clamp01(visual?.confidence ?? topology?.confidence, 0.85);
  const semanticConfidence = clamp01(semantic?.confidence, 0.7);

  let patternConsistency = 0.95;
  if (visual?.repeatedRowPattern === false && visualRows > 1) {
    patternConsistency = 0.72;
    disagreements.push('Repeated row pattern not confirmed across visual grid');
  }

  let signalAgreement = 1;
  if (disagreements.length > 0) {
    signalAgreement = Math.max(0.35, 1 - disagreements.length * 0.24);
  }

  const rawOverall =
    visualConfidence * 0.45 +
    semanticConfidence * 0.2 +
    patternConsistency * 0.2 +
    signalAgreement * 0.15;

  let overallConfidence = clamp01(rawOverall, 0.5);
  if (disagreements.length > 0) {
    overallConfidence = Math.min(overallConfidence, 0.92);
  }
  if (disagreements.length >= 2) {
    overallConfidence = Math.min(overallConfidence, 0.78);
  }

  const reviewRequired =
    Boolean(topology?.reviewRequired) ||
    disagreements.length > 0 ||
    overallConfidence < 0.82;

  // Confidence 1 only when all required evidence agrees.
  if (reviewRequired && overallConfidence >= 0.999) {
    overallConfidence = 0.92;
  }

  return {
    visualConfidence,
    semanticConfidence,
    patternConsistency,
    signalAgreement,
    overallConfidence,
    reviewRequired,
    disagreements,
  };
}

/**
 * Apply calibrated confidence to draft + topology.
 * @param {Record<string, unknown>} draft
 * @param {LoyaltyConfidenceSummary} summary
 */
export function applyConfidenceSummaryToDraft(draft = {}, summary) {
  const out = { ...(draft && typeof draft === 'object' ? draft : {}) };
  out.confidenceSummary = summary;
  out.confidence = summary.overallConfidence;
  out.layoutConfidence = summary.visualConfidence;
  out.topologyReviewRequired = summary.reviewRequired;

  if (out.cardTopology && typeof out.cardTopology === 'object') {
    out.cardTopology = {
      ...out.cardTopology,
      confidence: summary.overallConfidence,
      reviewRequired: summary.reviewRequired,
      confidenceBreakdown: summary,
    };
  }

  return out;
}

export default { calibrateLoyaltyEvidenceConfidence, applyConfidenceSummaryToDraft };
