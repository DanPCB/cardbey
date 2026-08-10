/**
 * Phase 4 — transparent, evidence-based, rights-aware recommendations.
 */

import { listResourceIndex } from './resourceIndex.js';
import { evaluateResourceRights } from './rightsIntelligence.js';
import { explainCandidate } from './candidateExplainer.js';
import { listLearningEvents } from './learningEngine.js';

/**
 * Recommend related resources with always-on explanations.
 */
export function recommendResources(input = {}) {
  const seedId = input.resourceId;
  const industry = input.industry;
  const pool = listResourceIndex({ industry, limit: 60 }).filter((r) => r.id !== seedId);

  const scored = pool.map((r) => {
    const rights = evaluateResourceRights(r);
    const explanation = explainCandidate(r, rights, {
      industry,
      purpose: input.purpose,
      channel: input.channel,
    });
    const signals = collectSignals(r, input);
    return {
      resource: r,
      rights,
      explanation,
      recommendation: {
        rankScore: signals.score,
        signals: signals.list,
        why: signals.list.map((s) => s.label),
        rightsAware: rights.decision?.decision !== 'REJECTED',
      },
    };
  });

  scored.sort((a, b) => b.recommendation.rankScore - a.recommendation.rankScore);

  return {
    ok: true,
    recommendations: scored.slice(0, input.limit || 12),
    policies: {
      aiIsNotAuthority: true,
      rightsFailClosed: true,
      alwaysExplain: true,
    },
  };
}

function collectSignals(resource, input) {
  const list = [];
  let score = 0;

  if (input.industry && resource.industry === input.industry) {
    list.push({ code: 'industry_favourite', label: 'Industry favourite signal', weight: 2 });
    score += 2;
  }
  if (resource.sourceId?.startsWith('src_cardbey')) {
    list.push({ code: 'cardbey_hosted', label: 'Cardbey-hosted / first-party preference', weight: 1.5 });
    score += 1.5;
  }
  if (resource.aiMetadata?.confidence > 0.6) {
    list.push({ code: 'better_quality', label: 'Higher metadata confidence', weight: 1 });
    score += 1;
  }
  if (resource.sourceId === 'src_pexels') {
    list.push({
      code: 'lower_licensing_friction',
      label: 'Open provider licence signal (still policy-gated)',
      weight: 0.5,
    });
    score += 0.5;
  }

  const events = listLearningEvents({ limit: 80 });
  const reuseHits = events.filter(
    (e) =>
      (e.type === 'reuse_success' || e.signal === 'search_completed') &&
      (e.resourceId === resource.id || e.payload?.resourceId === resource.id),
  ).length;
  if (reuseHits > 0) {
    list.push({
      code: 'frequently_used_together',
      label: `Frequently reused in platform (${reuseHits})`,
      weight: Math.min(2, reuseHits),
    });
    score += Math.min(2, reuseHits);
  }

  if (resource.provenance?.discoveredAt) {
    const age = Date.now() - new Date(resource.provenance.discoveredAt).getTime();
    if (age < 7 * 86400000) {
      list.push({ code: 'newest', label: 'Recently indexed', weight: 0.4 });
      score += 0.4;
    }
  }

  if (!list.length) {
    list.push({ code: 'alternative', label: 'Alternative match for intent', weight: 0.2 });
    score += 0.2;
  }

  return { score, list };
}
