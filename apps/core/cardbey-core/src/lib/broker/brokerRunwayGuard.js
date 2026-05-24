/**
 * Broker runway guards — opt-in bypass closure (Phase 1).
 */

import {
  isBrokerBlockDirectActionEnabled,
  isBrokerBlockOrchestraWithMissionEnabled,
} from './brokerFlags.js';

/**
 * @param {object} [body]
 * @returns {string|null}
 */
export function extractMissionIdFromRequestBody(body) {
  if (!body || typeof body !== 'object') return null;
  const direct = body.missionId ?? body.mission_id;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const req = body.request && typeof body.request === 'object' ? body.request : null;
  if (req?.missionId && typeof req.missionId === 'string' && req.missionId.trim()) {
    return req.missionId.trim();
  }
  const ctx = body.context && typeof body.context === 'object' ? body.context : null;
  if (ctx?.missionId && typeof ctx.missionId === 'string' && ctx.missionId.trim()) {
    return ctx.missionId.trim();
  }
  return null;
}

/**
 * @returns {{ blocked: boolean, code?: string, message?: string }}
 */
export function guardBrokerDirectAction() {
  if (!isBrokerBlockDirectActionEnabled()) {
    return { blocked: false };
  }
  return {
    blocked: true,
    code: 'BROKER_DIRECT_ACTION_BLOCKED',
    message:
      'Direct tool execution is disabled. Queue an IntentRequest or run via Mission Execution.',
  };
}

/**
 * @param {object} [body]
 * @returns {{ blocked: boolean, code?: string, message?: string, missionId?: string }}
 */
export function guardBrokerOrchestraStart(body) {
  if (!isBrokerBlockOrchestraWithMissionEnabled()) {
    return { blocked: false };
  }
  const missionId = extractMissionIdFromRequestBody(body);
  if (!missionId) {
    return { blocked: false };
  }
  return {
    blocked: true,
    missionId,
    code: 'BROKER_ORCHESTRA_BYPASS_BLOCKED',
    message:
      'orchestra/start is not allowed when missionId is present. Create an IntentRequest and run from Mission Execution.',
  };
}
