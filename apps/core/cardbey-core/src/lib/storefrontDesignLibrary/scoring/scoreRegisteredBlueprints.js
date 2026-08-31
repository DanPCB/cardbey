/**
 * Score all registered blueprints deterministically.
 */

import { listBlueprints, getBlueprint } from '../registries/index.js';
import { scoreBlueprint } from './blueprintScorer.js';
import { compareBlueprintScores } from './blueprintScoreResult.js';
import { gatherBlueprintScoringEvidence } from './blueprintEvidence.js';

/**
 * @param {object} catalog
 * @param {Record<string, unknown>} [context]
 * @returns {{
 *   evidence: import('./blueprintEvidence.js').BlueprintScoringEvidence,
 *   scores: import('./blueprintScoreResult.js').BlueprintScoreResult[],
 * }}
 */
export function scoreRegisteredBlueprints(catalog, context = {}) {
  const evidence = gatherBlueprintScoringEvidence(catalog, context);
  const blueprints = listBlueprints();
  if (!blueprints.length) {
    throw new Error('[designLibrary.scoring] Blueprint registry is empty');
  }

  const scores = blueprints
    .map((bp) => scoreBlueprint(bp, evidence))
    .sort(compareBlueprintScores);

  return { evidence, scores: Object.freeze(scores) };
}

/**
 * @param {string} blueprintId
 * @param {object} catalog
 * @param {Record<string, unknown>} [context]
 */
export function scoreBlueprintById(blueprintId, catalog, context = {}) {
  const bp = getBlueprint(blueprintId);
  if (!bp) {
    throw new Error(`[designLibrary.scoring] Unknown blueprint "${blueprintId}"`);
  }
  const evidence = gatherBlueprintScoringEvidence(catalog, context);
  return scoreBlueprint(bp, evidence);
}
