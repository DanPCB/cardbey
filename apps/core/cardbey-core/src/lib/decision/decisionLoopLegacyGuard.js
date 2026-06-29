/**
 * Guards legacy intake classification/dispatch when decision-loop authority is on.
 * Legacy paths remain for authority OFF only.
 */

import { isDecisionLoopEnabled } from '../../config/features.js';

export function isDecisionLoopAuthorityActive() {
  return isDecisionLoopEnabled();
}

/**
 * @param {boolean} decisionLoopEarlyRan
 */
export function shouldBlockLegacyIntakePaths(decisionLoopEarlyRan) {
  return isDecisionLoopEnabled() && decisionLoopEarlyRan === true;
}

/**
 * @param {Record<string, unknown> | null | undefined} classification
 */
export function isLoopOwnedClassification(classification) {
  return classification?._decisionLoop === true;
}

/**
 * Legacy direct_action dispatch is forbidden unless the loop authorized it.
 * @param {Record<string, unknown> | null | undefined} classification
 */
export function isLegacyDirectActionDispatchAllowed(classification) {
  if (!isDecisionLoopEnabled()) return true;
  if (!classification || classification.executionPath !== 'direct_action') return true;
  return isLoopOwnedClassification(classification);
}

/**
 * @param {Record<string, unknown> | null | undefined} classification
 */
export function shouldBlockLegacyClassificationMutation(classification) {
  return isDecisionLoopEnabled() && isLoopOwnedClassification(classification);
}

/**
 * @param {Record<string, unknown>} next
 * @param {Record<string, unknown> | null | undefined} current
 */
export function applyLoopClassificationGuard(next, current) {
  if (!shouldBlockLegacyClassificationMutation(current)) return next;
  if (isLoopOwnedClassification(next)) return next;
  return current;
}

/**
 * Telemetry-safe classification for HTTP responses when authority is on.
 * @param {Record<string, unknown> | null | undefined} classification
 */
export function normalizeTelemetryClassification(classification) {
  if (!classification || !isDecisionLoopEnabled()) return classification;
  if (classification.executionPath === 'direct_action' && !isLoopOwnedClassification(classification)) {
    return {
      ...classification,
      executionPath: 'decision_loop',
      _legacyDirectActionBlocked: true,
    };
  }
  return classification;
}
