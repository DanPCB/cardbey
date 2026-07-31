/**
 * Canonical BlueprintScoreResult / BlueprintRecommendation helpers.
 */

import { SCORER_VERSION } from './scoringWeights.js';

/**
 * @typedef {{
 *   code: string,
 *   contribution: number,
 *   detail?: string,
 * }} ScoreReason
 *
 * @typedef {{
 *   primaryActionSupported: boolean,
 *   secondaryActionsSupported: string[],
 *   unsupportedActions: string[],
 * }} ActionFitDetail
 *
 * @typedef {{
 *   blueprintId: string,
 *   blueprintVersion: number,
 *   score: number,
 *   eligible: boolean,
 *   reasons: ScoreReason[],
 *   penalties: ScoreReason[],
 *   matchedContentRoles: string[],
 *   missingRequiredData: string[],
 *   unsupportedContentRoles: string[],
 *   actionFit: ActionFitDetail,
 *   scorerVersion: number,
 *   dimensions?: Record<string, number>,
 * }} BlueprintScoreResult
 *
 * @typedef {{
 *   selected: BlueprintScoreResult,
 *   alternatives: BlueprintScoreResult[],
 *   allScores: BlueprintScoreResult[],
 *   confidence: number,
 *   recommendationReason: string,
 *   authoritative: false,
 *   scorerVersion: number,
 * }} BlueprintRecommendation
 */

/**
 * @param {Partial<BlueprintScoreResult> & {
 *   blueprintId: string,
 *   blueprintVersion: number,
 *   score: number,
 *   eligible: boolean,
 * }} partial
 * @returns {BlueprintScoreResult}
 */
export function freezeBlueprintScoreResult(partial) {
  return Object.freeze({
    blueprintId: partial.blueprintId,
    blueprintVersion: partial.blueprintVersion,
    score: clamp01(partial.score),
    eligible: Boolean(partial.eligible),
    reasons: Object.freeze([...(partial.reasons ?? [])].map(freezeReason)),
    penalties: Object.freeze([...(partial.penalties ?? [])].map(freezeReason)),
    matchedContentRoles: Object.freeze([...(partial.matchedContentRoles ?? [])]),
    missingRequiredData: Object.freeze([...(partial.missingRequiredData ?? [])]),
    unsupportedContentRoles: Object.freeze([...(partial.unsupportedContentRoles ?? [])]),
    actionFit: Object.freeze({
      primaryActionSupported: Boolean(partial.actionFit?.primaryActionSupported),
      secondaryActionsSupported: Object.freeze([
        ...(partial.actionFit?.secondaryActionsSupported ?? []),
      ]),
      unsupportedActions: Object.freeze([...(partial.actionFit?.unsupportedActions ?? [])]),
    }),
    scorerVersion: SCORER_VERSION,
    ...(partial.dimensions
      ? { dimensions: Object.freeze({ ...partial.dimensions }) }
      : {}),
  });
}

/**
 * @param {ScoreReason} r
 */
function freezeReason(r) {
  return Object.freeze({
    code: String(r.code),
    contribution: Number(r.contribution) || 0,
    ...(r.detail != null ? { detail: String(r.detail) } : {}),
  });
}

/**
 * @param {number} n
 */
export function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Deterministic sort: score desc, then blueprintId asc.
 * @param {BlueprintScoreResult} a
 * @param {BlueprintScoreResult} b
 */
export function compareBlueprintScores(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  return a.blueprintId.localeCompare(b.blueprintId);
}
