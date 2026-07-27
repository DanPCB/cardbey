/**
 * Startup validation — verify intake subsystems before accepting traffic.
 */

import { snapshotFeatures } from '../../config/features.js';
import { loadBelief } from '../decision/beliefLoader.js';
import { markStartupValidated, recordBeliefLoad } from '../decision/decisionLoopHealth.js';

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

  markStartupValidated();

  console.log('[STARTUP] ✅ System ready');
  console.log('[STARTUP] Intake classifier: IntentReasoner (single path)');

  return {
    ok: beliefLoaderOk,
    features,
    beliefLoader: beliefLoaderOk,
  };
}
