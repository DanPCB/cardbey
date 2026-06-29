/**
 * Phase 3 authority runner — decideTurn + optional legacy comparison.
 */

import { Features } from '../../config/features.js';
import { isIntakeDecisionLoopAuthorityEnabled } from './constants.js';
import { decideTurn } from './decideTurn.js';
import { turnResultToClassification } from './turnResultToClassification.js';
import { runAllAdvisors } from './advisors/index.js';
import { toolsAgree, normalizeLegacyTool } from './intentToolMap.js';
import { resolveToolForIntent } from './intentToolMap.js';
import { persistBeliefDelta } from './persistBeliefDelta.js';
import { recordDecisionLoopTurn } from './decisionLoopHealth.js';

/**
 * @param {object} opts
 * @param {import('./constants.js').BeliefSnapshot} opts.belief
 * @param {import('./advisorTypes.js').AdvisorInput} opts.input
 * @param {Record<string, unknown> | null} [opts.legacyClassification]
 * @returns {Promise<{ authority: boolean; turnResult: import('./decideTurn.js').TurnResult | null; classification: Record<string, unknown> | null; summary: Record<string, unknown> | null }>}
 */
export async function runDecisionLoopAuthority(opts = {}) {
  if (!isIntakeDecisionLoopAuthorityEnabled()) {
    return { authority: false, turnResult: null, classification: null, summary: null };
  }

  const belief = opts.belief;
  const input = opts.input ?? {};
  const legacy = opts.legacyClassification ?? null;

  if (!belief) {
    return { authority: true, turnResult: null, classification: null, summary: { skipped: true, reason: 'no_belief' } };
  }

  try {
    const hypotheses = runAllAdvisors(belief, input);
    const turnResult = decideTurn(belief, input, hypotheses);
    const classification = turnResultToClassification(turnResult);

    const shadowTool = turnResult.tool?.name ?? resolveToolForIntent(turnResult.chosen?.intent ?? '', null);
    const legacyTool = normalizeLegacyTool(legacy?.tool);
    const agree = legacyTool ? toolsAgree(shadowTool, legacyTool) : null;

    const summary = {
      event: 'intake_decision_loop_authority',
      sessionKey: belief.sessionKey,
      nextStep: turnResult.nextStep,
      chosenIntent: turnResult.chosen?.intent ?? null,
      tool: shadowTool,
      legacyTool,
      agree,
      governance: turnResult.governance,
    };

    recordDecisionLoopTurn(summary);

    if (process.env.NODE_ENV === 'development' || Features.decisionLoop.log) {
      console.log('[intake/decision-loop]', JSON.stringify(summary));
    }

    if (legacyTool && agree === false) {
      console.warn('[intake/decision-loop] replaced legacy classification', {
        sessionKey: belief.sessionKey,
        authorityTool: shadowTool,
        legacyTool,
        legacyOverride: legacy?._classificationOverride ?? null,
      });
    }

    if (turnResult.beliefDelta && Object.keys(turnResult.beliefDelta).length > 0) {
      await persistBeliefDelta({
        ...turnResult.beliefDelta,
        userId: belief.identity.userId,
        actorKey: belief.identity.actorId,
        tenantKey: belief.identity.actorId?.startsWith('u:') ? `t:${belief.identity.userId}` : 'unknown',
        storeId: belief.anchors.storeId,
        draftId: belief.anchors.draftId,
        missionId: belief.anchors.missionId,
      });
    }

    return { authority: true, turnResult, classification, summary };
  } catch (err) {
    console.warn('[intake/decision-loop] authority failed (non-blocking):', err?.message ?? err);
    return {
      authority: true,
      turnResult: null,
      classification: null,
      summary: { error: err?.message ?? 'unknown' },
    };
  }
}
