/**
 * Merge and rank advisor hypotheses (Phase 2 shadow rank).
 */

import { clampScore } from './hypothesisUtils.js';
import { resolveToolForIntent } from './intentToolMap.js';

/** @typedef {import('./hypothesisUtils.js').Hypothesis} Hypothesis */

/**
 * @typedef {object} RankedHypothesis
 * @property {string} intent
 * @property {number} score
 * @property {string | null} suggestedTool
 * @property {string[]} advisorIds
 * @property {import('./hypothesisUtils.js').HypothesisEvidence[]} evidence
 * @property {Array<'store'|'draft'|'confirmation'>} requiredContext
 */

/**
 * @param {Hypothesis[]} hypotheses
 * @returns {RankedHypothesis[]}
 */
export function mergeHypothesesByIntent(hypotheses) {
  /** @type {Map<string, RankedHypothesis>} */
  const byIntent = new Map();

  for (const h of hypotheses) {
    if (!h?.intent || h.score <= 0) continue;
    const existing = byIntent.get(h.intent);
    if (!existing) {
      byIntent.set(h.intent, {
        intent: h.intent,
        score: h.score,
        suggestedTool: h.suggestedTool ?? null,
        advisorIds: [h.advisorId],
        evidence: [...(h.evidence ?? [])],
        requiredContext: [...(h.requiredContext ?? [])],
      });
      continue;
    }
    existing.score = clampScore(Math.max(existing.score, h.score) + h.score * 0.15);
    if (!existing.suggestedTool && h.suggestedTool) existing.suggestedTool = h.suggestedTool;
    if (!existing.advisorIds.includes(h.advisorId)) existing.advisorIds.push(h.advisorId);
    existing.evidence.push(...(h.evidence ?? []));
    for (const rc of h.requiredContext ?? []) {
      if (!existing.requiredContext.includes(rc)) existing.requiredContext.push(rc);
    }
  }

  return [...byIntent.values()].sort((a, b) => b.score - a.score);
}

/**
 * @param {import('./constants.js').BeliefSnapshot} belief
 * @param {RankedHypothesis[]} merged
 */
export function applyBeliefConstraintPenalties(belief, merged) {
  for (const row of merged) {
    if (row.requiredContext.includes('store') && !belief.anchors.storeId && !belief.anchors.draftId) {
      if (row.intent === 'create_campaign' || row.intent === 'generate_graphic') {
        row.score = clampScore(row.score * 0.65);
      }
    }
    for (const blocker of belief.blockers ?? []) {
      if (blocker === 'needs_store_for_campaign' && row.intent === 'create_campaign') {
        row.score = clampScore(row.score * 0.5);
      }
    }
  }
  merged.sort((a, b) => b.score - a.score);
  return merged;
}

/**
 * @param {Hypothesis[]} hypotheses
 * @param {import('./constants.js').BeliefSnapshot} belief
 * @returns {{ ranked: RankedHypothesis[]; top: RankedHypothesis | null; shadowTool: string | null }}
 */
export function rankHypotheses(hypotheses, belief) {
  let ranked = mergeHypothesesByIntent(hypotheses);
  ranked = applyBeliefConstraintPenalties(belief, ranked);

  // Baseline chat fallback
  if (ranked.length === 0) {
    ranked.push({
      intent: 'general_chat',
      score: 0.25,
      suggestedTool: 'general_chat',
      advisorIds: ['fallback'],
      evidence: [{ source: 'fallback', fact: 'no_hypothesis' }],
      requiredContext: [],
    });
  }

  const top = ranked[0] ?? null;
  const shadowTool = top ? resolveToolForIntent(top.intent, top.suggestedTool) : null;

  return { ranked, top, shadowTool };
}

/**
 * @param {RankedHypothesis[]} ranked
 * @param {number} [margin=0.15]
 */
export function isAmbiguousRank(ranked, margin = 0.15) {
  if (ranked.length < 2) return false;
  return ranked[0].score - ranked[1].score < margin;
}
