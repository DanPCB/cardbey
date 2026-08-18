/**
 * Canonical Performer operator status (P0 contract).
 * Chat, inspector, and step UI MUST project the same value.
 *
 * @module performerTurnBelief/performerStatus
 */

/** @typedef {'NEEDS_EVIDENCE'|'READY_TO_PROPOSE'|'AWAITING_CONFIRM'|'RUNNING'|'BLOCKED'|'DONE'|'FAILED'} PerformerStatus */

export const PERFORMER_STATUS = Object.freeze({
  NEEDS_EVIDENCE: 'NEEDS_EVIDENCE',
  READY_TO_PROPOSE: 'READY_TO_PROPOSE',
  AWAITING_CONFIRM: 'AWAITING_CONFIRM',
  RUNNING: 'RUNNING',
  BLOCKED: 'BLOCKED',
  DONE: 'DONE',
  FAILED: 'FAILED',
});

/** @type {readonly PerformerStatus[]} */
export const PERFORMER_STATUS_VALUES = Object.freeze(Object.values(PERFORMER_STATUS));

/**
 * @param {unknown} value
 * @returns {value is PerformerStatus}
 */
export function isPerformerStatus(value) {
  return typeof value === 'string' && PERFORMER_STATUS_VALUES.includes(/** @type {PerformerStatus} */ (value));
}

/**
 * @param {unknown} value
 * @param {PerformerStatus} [fallback]
 * @returns {PerformerStatus}
 */
export function normalizePerformerStatus(value, fallback = PERFORMER_STATUS.NEEDS_EVIDENCE) {
  if (isPerformerStatus(value)) return value;
  return fallback;
}

/**
 * Statuses that may start or continue non-confirm tool dispatch.
 * @param {PerformerStatus} status
 */
export function canDispatchTools(status) {
  const s = normalizePerformerStatus(status);
  return s === PERFORMER_STATUS.READY_TO_PROPOSE || s === PERFORMER_STATUS.RUNNING;
}

/**
 * Statuses that forbid inventing customer-facing catalog to “make progress.”
 * @param {PerformerStatus} status
 */
export function forbidsCatalogInvention(status) {
  const s = normalizePerformerStatus(status);
  return (
    s === PERFORMER_STATUS.NEEDS_EVIDENCE ||
    s === PERFORMER_STATUS.BLOCKED ||
    s === PERFORMER_STATUS.AWAITING_CONFIRM ||
    s === PERFORMER_STATUS.FAILED
  );
}

/**
 * Celebratory “kicked off / complete” copy allowed only in these states.
 * @param {PerformerStatus} status
 */
export function allowsCelebratoryCopy(status) {
  const s = normalizePerformerStatus(status);
  return s === PERFORMER_STATUS.RUNNING || s === PERFORMER_STATUS.DONE;
}

/**
 * Human-readable label for UI (not a second status system).
 * @param {PerformerStatus} status
 */
export function performerStatusLabel(status) {
  switch (normalizePerformerStatus(status)) {
    case PERFORMER_STATUS.NEEDS_EVIDENCE:
      return 'Needs more evidence';
    case PERFORMER_STATUS.READY_TO_PROPOSE:
      return 'Ready to propose';
    case PERFORMER_STATUS.AWAITING_CONFIRM:
      return 'Needs your approval';
    case PERFORMER_STATUS.RUNNING:
      return 'Working';
    case PERFORMER_STATUS.BLOCKED:
      return 'Blocked';
    case PERFORMER_STATUS.DONE:
      return 'Completed';
    case PERFORMER_STATUS.FAILED:
      return 'Failed';
    default:
      return 'Needs more evidence';
  }
}

export default {
  PERFORMER_STATUS,
  PERFORMER_STATUS_VALUES,
  isPerformerStatus,
  normalizePerformerStatus,
  canDispatchTools,
  forbidsCatalogInvention,
  allowsCelebratoryCopy,
  performerStatusLabel,
};
