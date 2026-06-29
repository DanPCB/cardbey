/**
 * Runtime health state for the intake decision loop.
 */

import { Features, snapshotFeatures } from '../../config/features.js';

/** @type {{ at: string; summary: Record<string, unknown> } | null} */
let lastDecision = null;

let beliefLoadCount = 0;
let decisionTurnCount = 0;
let startupValidated = false;

/**
 * @param {Record<string, unknown>} summary
 */
export function recordDecisionLoopTurn(summary) {
  decisionTurnCount += 1;
  lastDecision = {
    at: new Date().toISOString(),
    summary: summary ?? {},
  };
}

export function recordBeliefLoad() {
  beliefLoadCount += 1;
}

export function markStartupValidated() {
  startupValidated = true;
}

export function isDecisionLoopActive() {
  if (!Features.decisionLoop.enabled) return false;
  return startupValidated || decisionTurnCount > 0;
}

export async function getLastDecision() {
  return lastDecision;
}

export function isBeliefLoaderActive() {
  return beliefLoadCount > 0 || startupValidated;
}

export function getBeliefCacheSize() {
  return beliefLoadCount;
}

export function getDecisionLoopHealth() {
  return {
    enabled: Features.decisionLoop.enabled,
    running: isDecisionLoopActive(),
    turnCount: decisionTurnCount,
    lastDecision,
    belief: {
      loaded: isBeliefLoaderActive(),
      loadCount: getBeliefCacheSize(),
    },
    features: snapshotFeatures(),
  };
}

/** @internal tests */
export function resetDecisionLoopHealthForTests() {
  lastDecision = null;
  beliefLoadCount = 0;
  decisionTurnCount = 0;
  startupValidated = false;
}
