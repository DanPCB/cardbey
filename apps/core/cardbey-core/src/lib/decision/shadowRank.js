/**
 * Shadow rank — compare advisor merge vs legacy classification (Phase 2).
 */

import { isIntakeAdvisorShadowEnabled } from './constants.js';
import { Features } from '../../config/features.js';
import { runAllAdvisors } from './advisors/index.js';
import { rankHypotheses, isAmbiguousRank } from './rankHypotheses.js';
import { toolsAgree, normalizeLegacyTool } from './intentToolMap.js';

/**
 * @param {object} opts
 * @param {import('./constants.js').BeliefSnapshot} opts.belief
 * @param {import('./advisorTypes.js').AdvisorInput} opts.input
 * @param {Record<string, unknown> | null} opts.legacyClassification
 * @returns {{ enabled: boolean; summary: Record<string, unknown> | null }}
 */
export function runIntakeShadowRank(opts = {}) {
  if (!isIntakeAdvisorShadowEnabled()) {
    return { enabled: false, summary: null };
  }

  const belief = opts.belief;
  const input = opts.input ?? {};
  const legacy = opts.legacyClassification && typeof opts.legacyClassification === 'object'
    ? opts.legacyClassification
    : null;

  if (!belief) {
    return { enabled: true, summary: { skipped: true, reason: 'no_belief' } };
  }

  try {
    const rawHypotheses = runAllAdvisors(belief, input);
    const { ranked, top, shadowTool } = rankHypotheses(rawHypotheses, belief);
    const legacyTool = normalizeLegacyTool(legacy?.tool);
    const agree = legacyTool ? toolsAgree(shadowTool ?? '', legacyTool) : null;
    const ambiguous = isAmbiguousRank(ranked);

    const summary = {
      event: 'intake_shadow_rank',
      sessionKey: belief.sessionKey,
      shadowIntent: top?.intent ?? null,
      shadowTool,
      shadowScore: top?.score ?? null,
      shadowAdvisors: top?.advisorIds ?? [],
      legacyTool,
      legacyExecutionPath: legacy?.executionPath ?? null,
      agree,
      ambiguous,
      top3: ranked.slice(0, 3).map((r) => ({
        intent: r.intent,
        score: Number(r.score.toFixed(3)),
        tool: r.suggestedTool,
      })),
      hypothesisCount: rawHypotheses.length,
    };

    if (process.env.NODE_ENV === 'development' || Features.advisor.shadowLog) {
      console.log('[intake/shadow-rank]', JSON.stringify(summary));
    }

    if (legacyTool && agree === false) {
      console.warn('[intake/shadow-rank] divergence', {
        sessionKey: belief.sessionKey,
        shadowTool,
        legacyTool,
        shadowIntent: top?.intent,
        legacyOverride: legacy?._classificationOverride ?? null,
      });
    }

    return { enabled: true, summary };
  } catch (err) {
    console.warn('[intake/shadow-rank] failed (non-blocking):', err?.message ?? err);
    return { enabled: true, summary: { error: err?.message ?? 'unknown' } };
  }
}
