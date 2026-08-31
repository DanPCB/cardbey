/**
 * Recommend a blueprint (advisory). Attach meta when flag on.
 */

import { isDesignLibraryV1Enabled, isDesignLibraryAuthoritative } from '../flags.js';
import { scoreRegisteredBlueprints } from './scoreRegisteredBlueprints.js';
import { compareBlueprintScores, clamp01 } from './blueprintScoreResult.js';
import { SCORER_VERSION } from './scoringWeights.js';

/**
 * @param {object} catalog
 * @param {Record<string, unknown>} [context]
 * @returns {import('./blueprintScoreResult.js').BlueprintRecommendation}
 */
export function recommendBlueprintsForDraft(catalog, context = {}) {
  void isDesignLibraryAuthoritative(); // always false in Phase 4
  const { evidence, scores } = scoreRegisteredBlueprints(catalog, context);

  const eligible = scores.filter((s) => s.eligible).sort(compareBlueprintScores);
  const pool = eligible.length > 0 ? eligible : [...scores].sort(compareBlueprintScores);

  const selected = pool[0];
  const alternatives = pool.slice(1, 3);

  const confidence = computeRecommendationConfidence(selected, pool, evidence);
  const recommendationReason = buildRecommendationReason(selected, evidence);

  return Object.freeze({
    selected,
    alternatives: Object.freeze([...alternatives]),
    allScores: scores,
    confidence,
    recommendationReason,
    authoritative: false,
    scorerVersion: SCORER_VERSION,
  });
}

/**
 * @param {object} catalog
 * @param {Record<string, unknown>} [context]
 * @param {{ force?: boolean, emit?: boolean, missionId?: string|null, draftStoreId?: string|null }} [opts]
 */
export function applyDesignLibraryBlueprintRecommendation(catalog, context = {}, opts = {}) {
  if (!catalog || typeof catalog !== 'object') {
    return { catalog, recommendation: null, attached: false };
  }
  if (!opts.force && !isDesignLibraryV1Enabled()) {
    return { catalog, recommendation: null, attached: false };
  }

  const recommendation = recommendBlueprintsForDraft(catalog, context);
  const selected = recommendation.selected;

  const next = {
    ...catalog,
    meta: {
      ...(catalog.meta && typeof catalog.meta === 'object' ? catalog.meta : {}),
      designLibraryBlueprintRecommendation: {
        selectedBlueprintId: selected.blueprintId,
        selectedScore: selected.score,
        alternatives: recommendation.alternatives.map((a) =>
          Object.freeze({
            blueprintId: a.blueprintId,
            score: a.score,
          }),
        ),
        confidence: recommendation.confidence,
        reasons: selected.reasons.slice(0, 8).map((r) => r.code),
        recommendationReason: recommendation.recommendationReason,
        inferredBusinessModel: catalog.meta?.designLibraryCommercePolicy?.businessModel ?? null,
        primaryAction: catalog.meta?.designLibraryCommercePolicy?.primaryAction ?? null,
        authoritative: false,
        scorerVersion: SCORER_VERSION,
      },
    },
  };

  if (opts.emit !== false) {
    emitBlueprintScored({
      missionId: opts.missionId ?? null,
      draftStoreId: opts.draftStoreId ?? null,
      recommendation,
      catalog: next,
    });
  }

  return { catalog: next, recommendation, attached: true };
}

/**
 * @param {{
 *   missionId?: string|null,
 *   draftStoreId?: string|null,
 *   recommendation: import('./blueprintScoreResult.js').BlueprintRecommendation,
 *   catalog: object,
 * }} payload
 */
export function emitBlueprintScored(payload) {
  const { recommendation, catalog } = payload;
  const policy = catalog?.meta?.designLibraryCommercePolicy ?? {};
  const event = {
    event: 'storefront.blueprint.scored',
    missionId: payload.missionId ?? null,
    draftStoreId: payload.draftStoreId ?? null,
    scorerVersion: SCORER_VERSION,
    inferredBusinessModel: policy.businessModel ?? null,
    primaryAction: policy.primaryAction ?? null,
    selectedBlueprintId: recommendation.selected.blueprintId,
    selectedScore: recommendation.selected.score,
    confidence: recommendation.confidence,
    alternatives: recommendation.alternatives.map((a) => ({
      blueprintId: a.blueprintId,
      score: a.score,
    })),
  };
  if (process.env.NODE_ENV !== 'production' || process.env.DESIGN_LIBRARY_POLICY_LOG === '1') {
    try {
      console.info('[storefrontDesignLibrary]', JSON.stringify(event));
    } catch {
      /* ignore */
    }
  }
  return event;
}

/**
 * @param {import('./blueprintScoreResult.js').BlueprintScoreResult} selected
 * @param {import('./blueprintScoreResult.js').BlueprintScoreResult[]} pool
 * @param {import('./blueprintEvidence.js').BlueprintScoringEvidence} evidence
 */
function computeRecommendationConfidence(selected, pool, evidence) {
  const second = pool[1];
  const gap = second ? Math.max(0, selected.score - second.score) : selected.score;
  const richness = Math.min(
    1,
    (evidence.offeringRoles.length + evidence.trustRoles.length) / 6 +
      (evidence.classificationTotal > 5 ? 0.2 : 0),
  );
  return clamp01(
    selected.score * 0.45 +
      evidence.businessModelConfidence * 0.25 +
      gap * 0.2 +
      richness * 0.1,
  );
}

/**
 * @param {import('./blueprintScoreResult.js').BlueprintScoreResult} selected
 * @param {import('./blueprintEvidence.js').BlueprintScoringEvidence} evidence
 */
function buildRecommendationReason(selected, evidence) {
  const bits = [
    `Selected ${selected.blueprintId} for business model ${evidence.businessModel}`,
  ];
  if (evidence.primaryAction) {
    bits.push(`primary action ${evidence.primaryAction}`);
  }
  if (selected.matchedContentRoles.length) {
    bits.push(`matched roles: ${selected.matchedContentRoles.slice(0, 5).join(', ')}`);
  }
  return bits.join('; ');
}
