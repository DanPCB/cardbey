/**
 * Shadow-mode belief load for intake v2 (Phase 1 — read-only, no behavior change).
 */

import { isIntakeBeliefShadowEnabled } from './constants.js';
import { Features } from '../../config/features.js';
import { loadBelief, summarizeBeliefForShadow } from './beliefLoader.js';
import { hasMaterialDivergence } from './beliefDivergence.js';

/**
 * @param {object} opts — same shape as loadBelief
 * @returns {Promise<{ enabled: boolean; belief: import('./constants.js').BeliefSnapshot | null; summary: Record<string, unknown> | null }>}
 */
export async function runIntakeBeliefShadow(opts = {}) {
  if (!isIntakeBeliefShadowEnabled()) {
    return { enabled: false, belief: null, summary: null };
  }

  try {
    const belief = await loadBelief(opts);
    const summary = summarizeBeliefForShadow(belief);

    const logPayload = {
      event: 'intake_belief_shadow',
      ...summary,
    };

    if (process.env.NODE_ENV === 'development' || Features.belief.shadowLog) {
      console.log('[intake/belief]', JSON.stringify(logPayload));
    }

    if (hasMaterialDivergence(belief.divergences)) {
      console.warn('[intake/belief] material divergence', {
        sessionKey: belief.sessionKey,
        divergences: belief.divergences,
      });
    }

    return { enabled: true, belief, summary };
  } catch (err) {
    console.warn('[intake/belief] shadow load failed (non-blocking):', err?.message ?? err);
    return { enabled: true, belief: null, summary: { error: err?.message ?? 'unknown' } };
  }
}
