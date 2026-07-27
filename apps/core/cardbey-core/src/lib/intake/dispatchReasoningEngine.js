/**
 * Governance-aware dispatch reasoning (backend port of dashboard reasoningEngine).
 */

import { collectLearnedSignals, hasLearnedSignal, MEMORY_SIGNAL_KEYS } from './dispatchMemorySignals.js';

const HIGH_RISK_ACTIONS = new Set(['publish', 'data_deletion', 'launch_campaign', 'create_offer']);

/**
 * @param {string} action
 * @param {Record<string, unknown> | null | undefined} memoryBundle
 * @param {{ requiresConfirmation?: boolean }} [capability]
 */
export function reasonAboutDispatch(action, memoryBundle, capability = {}) {
  const governanceAction = String(action ?? '').trim();
  const reasoningNotes = [];
  let requiresConfirmation = capability.requiresConfirmation === true || HIGH_RISK_ACTIONS.has(governanceAction);
  let confidence = 0.5;

  const business =
    memoryBundle?.business && typeof memoryBundle.business === 'object' ? memoryBundle.business : null;
  const recentOutcomes = Array.isArray(business?.recentOutcomes) ? business.recentOutcomes : [];
  const successes = recentOutcomes.filter((o) => o && typeof o === 'object' && o.success === true);
  const rate = recentOutcomes.length > 0 ? successes.length / recentOutcomes.length : null;

  if (rate !== null && rate > 0.8 && !HIGH_RISK_ACTIONS.has(governanceAction)) {
    requiresConfirmation = false;
    confidence = rate;
    reasoningNotes.push(`High success rate (${Math.round(rate * 100)}%) for this action`);
  } else if (rate !== null && rate < 0.3) {
    requiresConfirmation = true;
    confidence = rate;
    reasoningNotes.push(`Low success rate (${Math.round(rate * 100)}%) - requiring confirmation`);
  }

  const sessionSignals = collectLearnedSignals(memoryBundle);
  if (hasLearnedSignal(sessionSignals, MEMORY_SIGNAL_KEYS.HIGH_INTENT) && !HIGH_RISK_ACTIONS.has(governanceAction)) {
    requiresConfirmation = false;
    reasoningNotes.push('High intent signal detected - reducing friction');
  }
  if (hasLearnedSignal(sessionSignals, MEMORY_SIGNAL_KEYS.FIRST_TIME_USER) && HIGH_RISK_ACTIONS.has(governanceAction)) {
    requiresConfirmation = true;
    reasoningNotes.push('First-time user - requiring confirmation for guidance');
  }

  return {
    governanceAction,
    requiresConfirmation,
    confidence,
    reasoning: reasoningNotes,
    memoryUsed: Boolean(memoryBundle),
  };
}
