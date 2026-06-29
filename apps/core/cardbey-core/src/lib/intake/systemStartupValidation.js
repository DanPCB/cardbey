/**
 * Startup validation — verify decision loop subsystems before accepting traffic.
 */

import { Features, snapshotFeatures } from '../../config/features.js';
import { loadBelief } from '../decision/beliefLoader.js';
import { decideTurn } from '../decision/decideTurn.js';
import { markStartupValidated, recordBeliefLoad, recordDecisionLoopTurn } from '../decision/decisionLoopHealth.js';

/** @returns {import('../decision/constants.js').BeliefSnapshot} */
function startupTestBelief() {
  return {
    sessionId: 'startup-test',
    sessionKey: 'startup-test',
    identity: { guest: true, actorId: 'g:startup', userId: null },
    anchors: { storeId: null, draftId: null, missionId: null },
    workflow: null,
    lastUpload: null,
    activeGoal: null,
    pendingClarify: null,
    blockers: [],
    sourcesLoaded: ['startup_probe'],
    divergences: [],
    loadedAt: new Date().toISOString(),
    loaderVersion: 'startup-probe',
  };
}

export async function validateSystemStartup() {
  const features = snapshotFeatures();
  console.log('[STARTUP] Features:', features);

  let beliefLoaderOk = false;
  try {
    const testBelief = await loadBelief({
      sessionId: 'startup-test',
      sessionKey: 'startup-test',
      body: {},
      intentSourceContext: {},
      currentContext: {},
    });
    beliefLoaderOk = Boolean(testBelief?.sessionKey);
    if (beliefLoaderOk) recordBeliefLoad();
    console.log('[STARTUP] Belief loader:', beliefLoaderOk ? '✅' : '❌');
  } catch (err) {
    console.warn('[STARTUP] Belief loader failed:', err?.message ?? err);
    console.log('[STARTUP] Belief loader: ❌');
  }

  let decisionLoopOk = false;
  try {
    const belief = startupTestBelief();
    const testResult = decideTurn(belief, { userMessage: 'test', originalUserMessage: 'test' });
    decisionLoopOk = Boolean(testResult?.nextStep);
    if (decisionLoopOk) {
      recordDecisionLoopTurn({ event: 'startup_probe', nextStep: testResult.nextStep });
    }
    console.log('[STARTUP] Decision loop:', decisionLoopOk ? '✅' : '❌');
  } catch (err) {
    console.warn('[STARTUP] Decision loop probe failed:', err?.message ?? err);
    console.log('[STARTUP] Decision loop: ❌');
  }

  markStartupValidated();

  const active = Features.decisionLoop.enabled;
  console.log('[STARTUP] ✅ System ready');
  console.log(`[STARTUP] Decision Loop: ${active ? '🔴 ACTIVE' : '⚪ INACTIVE'}`);

  return {
    ok: beliefLoaderOk && decisionLoopOk,
    features,
    beliefLoader: beliefLoaderOk,
    decisionLoop: decisionLoopOk,
    decisionLoopAuthority: active,
  };
}
