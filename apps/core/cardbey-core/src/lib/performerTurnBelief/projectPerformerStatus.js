/**
 * Single status projector for chat + inspector (P2).
 * Maps TurnBelief + optional runtime hints → one PERFORMER_STATUS view.
 *
 * @module performerTurnBelief/projectPerformerStatus
 */

import {
  PERFORMER_STATUS,
  normalizePerformerStatus,
  canDispatchTools,
  forbidsCatalogInvention,
  allowsCelebratoryCopy,
  performerStatusLabel,
} from './performerStatus.js';
import { isTurnBelief, hasHardConflict, CONFIRMATION_STATE } from './turnBelief.js';

/** @typedef {import('./performerStatus.js').PerformerStatus} PerformerStatus */
/** @typedef {import('./turnBelief.js').TurnBelief} TurnBelief */

/**
 * @typedef {Object} PerformerStatusProjection
 * @property {PerformerStatus} status
 * @property {string} label
 * @property {boolean} allowsCelebratoryCopy
 * @property {boolean} canDispatchTools
 * @property {boolean} forbidsCatalogInvention
 * @property {string} userVisibleSummary
 */

/**
 * @typedef {Object} PerformerStatusRuntimeHints
 * @property {boolean} [missionRunning] Mission/pipeline actively running after authorized start
 * @property {boolean} [failed] Execution failed after start
 * @property {boolean} [awaitingConfirm] Governance / safe-execution confirmation pending
 */

/**
 * Project one operator status from TurnBelief, with careful runtime overrides.
 * Prefers `belief.status`; upgrades to RUNNING when mission started; AWAITING_CONFIRM when governance pending.
 *
 * @param {TurnBelief | null | undefined} belief
 * @param {PerformerStatusRuntimeHints} [runtimeHints]
 * @returns {PerformerStatusProjection}
 */
export function projectPerformerStatus(belief, runtimeHints = {}) {
  const hints =
    runtimeHints && typeof runtimeHints === 'object' && !Array.isArray(runtimeHints)
      ? runtimeHints
      : {};
  const missionRunning = Boolean(hints.missionRunning);
  const failed = Boolean(hints.failed);
  const awaitingConfirm = Boolean(hints.awaitingConfirm);
  const beliefPresent = isTurnBelief(belief);

  let status = normalizePerformerStatus(
    beliefPresent ? belief.status : null,
    PERFORMER_STATUS.NEEDS_EVIDENCE,
  );

  if (beliefPresent && hasHardConflict(belief)) {
    status = PERFORMER_STATUS.BLOCKED;
  } else if (failed) {
    status = PERFORMER_STATUS.FAILED;
  } else if (
    awaitingConfirm ||
    (beliefPresent && belief.confirmationState === CONFIRMATION_STATE.PENDING)
  ) {
    status = PERFORMER_STATUS.AWAITING_CONFIRM;
  } else if (missionRunning) {
    if (
      status === PERFORMER_STATUS.READY_TO_PROPOSE ||
      (!beliefPresent && status === PERFORMER_STATUS.NEEDS_EVIDENCE)
    ) {
      status = PERFORMER_STATUS.RUNNING;
    }
  }

  const userVisibleSummary =
    beliefPresent && typeof belief.userVisibleSummary === 'string'
      ? belief.userVisibleSummary
      : '';

  return {
    status,
    label: performerStatusLabel(status),
    allowsCelebratoryCopy: allowsCelebratoryCopy(status),
    canDispatchTools: canDispatchTools(status),
    forbidsCatalogInvention: forbidsCatalogInvention(status),
    userVisibleSummary,
  };
}

/**
 * Flatten projection onto intake/inspector response bodies.
 * @param {PerformerStatusProjection} projection
 * @returns {Record<string, unknown>}
 */
export function performerStatusResponseFields(projection) {
  return {
    performerStatus: projection.status,
    performerStatusLabel: projection.label,
    allowsCelebratoryCopy: projection.allowsCelebratoryCopy,
    canDispatchTools: projection.canDispatchTools,
    forbidsCatalogInvention: projection.forbidsCatalogInvention,
    userVisibleSummary: projection.userVisibleSummary,
  };
}

export default {
  projectPerformerStatus,
  performerStatusResponseFields,
};
