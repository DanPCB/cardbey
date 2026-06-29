/**
 * Hypothesis helpers for intake advisors (Phase 2).
 */

/**
 * @typedef {object} HypothesisEvidence
 * @property {string} source
 * @property {string} fact
 * @property {number} [weight]
 */

/**
 * @typedef {object} Hypothesis
 * @property {string} intent
 * @property {number} score
 * @property {HypothesisEvidence[]} evidence
 * @property {string | null} [suggestedTool]
 * @property {Array<'store'|'draft'|'confirmation'>} [requiredContext]
 * @property {string} advisorId
 */

/**
 * @param {object} params
 * @returns {Hypothesis}
 */
export function createHypothesis({
  intent,
  score,
  advisorId,
  evidence = [],
  suggestedTool = null,
  requiredContext = [],
}) {
  return {
    intent: String(intent ?? '').trim() || 'unknown',
    score: clampScore(score),
    evidence: Array.isArray(evidence) ? evidence : [],
    suggestedTool: suggestedTool ? String(suggestedTool).trim() : null,
    requiredContext: Array.isArray(requiredContext) ? requiredContext : [],
    advisorId: String(advisorId ?? '').trim() || 'unknown',
  };
}

/**
 * @param {number} score
 */
export function clampScore(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * @param {Hypothesis[]} hypotheses
 * @param {Hypothesis} hypothesis
 */
export function pushHypothesis(hypotheses, hypothesis) {
  if (!hypothesis || hypothesis.score <= 0) return;
  hypotheses.push(hypothesis);
}
