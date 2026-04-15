/**
 * Execution policy from risk + confidence (not classifier optimism alone).
 */

import { RISK } from './intakeToolRegistry.js';

export const CONFIDENCE_HIGH = 0.8;
export const CONFIDENCE_MEDIUM = 0.55;

/**
 * @param {object} p
 * @param {'direct_action'|'proactive_plan'|'chat'|'clarify'} p.executionPath
 * @param {string} [p.riskLevel]
 * @param {number} p.confidence
 * @returns {{ decision: 'execute'|'clarify'|'approval_required'|'block', reason?: string }}
 */
export function evaluateExecutionPolicy(p) {
  const { executionPath, riskLevel, confidence } = p;
  const conf = typeof confidence === 'number' && !Number.isNaN(confidence) ? confidence : 0;
  const risk = riskLevel || RISK.SAFE_READ;

  if (executionPath === 'clarify' || executionPath === 'chat') {
    return { decision: 'execute', reason: 'non_executable_path' };
  }

  if (risk === RISK.DESTRUCTIVE) {
    return { decision: 'approval_required', reason: 'destructive_requires_approval' };
  }

  if (executionPath === 'direct_action') {
    if (risk === RISK.SAFE_READ) {
      if (conf < CONFIDENCE_MEDIUM) {
        return { decision: 'clarify', reason: 'low_confidence_safe_read' };
      }
      return { decision: 'execute', reason: 'safe_read' };
    }
    if (risk === RISK.STATE_CHANGE) {
      if (conf < CONFIDENCE_HIGH) {
        return { decision: 'clarify', reason: 'state_change_medium_or_low_confidence' };
      }
      return { decision: 'execute', reason: 'state_change_high_confidence' };
    }
  }

  if (executionPath === 'proactive_plan') {
    if (conf < CONFIDENCE_MEDIUM) {
      return { decision: 'clarify', reason: 'low_confidence_plan' };
    }
    if (risk === RISK.STATE_CHANGE && conf < CONFIDENCE_HIGH) {
      return { decision: 'clarify', reason: 'plan_state_change_not_high_confidence' };
    }
    return { decision: 'execute', reason: 'plan_ok' };
  }

  return { decision: 'execute', reason: 'default' };
}
