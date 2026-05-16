/**
 * Mission Pipeline v1: single place for allowed status transitions.
 * Terminal: completed, cancelled — no outgoing transitions.
 */

const ALLOWED = {
  requested: ['planned', 'cancelled'],
  planned: ['awaiting_confirmation', 'queued', 'cancelled'],
  awaiting_confirmation: ['queued', 'cancelled'],
  queued: ['executing', 'cancelled', 'completed', 'paused'],
  executing: ['paused', 'completed', 'failed', 'cancelled', 'awaiting_input'],
  /** Owner responded to a checkpoint; pipeline resumes via runMissionUntilBlocked only. */
  awaiting_input: ['executing', 'cancelled'],
  paused: ['queued', 'cancelled'],
  failed: ['queued', 'cancelled'],
  completed: [],
  cancelled: [],
};

/**
 * @param {string} fromStatus
 * @param {string} toStatus
 * @returns {boolean}
 */
export function canTransitionMissionPipeline(fromStatus, toStatus) {
  if (!fromStatus || !toStatus) return false;
  const next = ALLOWED[fromStatus];
  return Array.isArray(next) && next.includes(toStatus);
}

export const MISSION_PIPELINE_STATUSES = Object.keys(ALLOWED);
