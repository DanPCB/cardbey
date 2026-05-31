/**
 * Shared MissionPipeline terminal status normalization (core authority).
 * Aligns with dashboard TERMINAL_MISSION_STATUSES / runState where noted.
 */

/** Lowercase status values that mean the pipeline has ended (any terminal). */
export const MISSION_PIPELINE_TERMINAL_STATUSES = new Set([
  'completed',
  'failed',
  'cancelled',
  'canceled',
  'done',
  'ended',
  'succeeded',
  'success',
]);

/**
 * Terminal statuses suitable for post-completion continuation handoff
 * (successful completion — not failed/cancelled).
 */
export const MISSION_PIPELINE_SUCCESS_TERMINAL_STATUSES = new Set([
  'completed',
  'done',
  'succeeded',
  'success',
]);

/** Lowercase runState values that mean the pipeline has ended. */
export const MISSION_PIPELINE_TERMINAL_RUN_STATES = new Set([
  'done',
  'failed',
  'error',
  'cancelled',
  'canceled',
  'ended',
]);

/**
 * @param {unknown} status
 * @returns {string}
 */
export function normalizeMissionPipelineStatus(status) {
  return String(status ?? '').trim().toLowerCase();
}

/**
 * @param {unknown} runState
 * @returns {string}
 */
export function normalizeMissionPipelineRunState(runState) {
  return String(runState ?? '').trim().toLowerCase();
}

/**
 * @param {unknown} status
 * @param {{ runState?: unknown }} [options]
 * @returns {boolean}
 */
export function isTerminalMissionPipelineStatus(status, options = {}) {
  const st = normalizeMissionPipelineStatus(status);
  if (st && MISSION_PIPELINE_TERMINAL_STATUSES.has(st)) return true;
  const rs = normalizeMissionPipelineRunState(options.runState);
  return rs.length > 0 && MISSION_PIPELINE_TERMINAL_RUN_STATES.has(rs);
}

/**
 * Successful terminal only — used for continuation contract recovery.
 *
 * @param {unknown} status
 * @param {{ runState?: unknown }} [options]
 * @returns {boolean}
 */
const NON_SUCCESS_TERMINAL_STATUSES = new Set(['failed', 'cancelled', 'canceled', 'error', 'aborted']);

export function isSuccessfulTerminalMissionPipelineStatus(status, options = {}) {
  const st = normalizeMissionPipelineStatus(status);
  if (st && NON_SUCCESS_TERMINAL_STATUSES.has(st)) return false;
  if (st && MISSION_PIPELINE_SUCCESS_TERMINAL_STATUSES.has(st)) return true;
  const rs = normalizeMissionPipelineRunState(options.runState);
  if (rs && NON_SUCCESS_TERMINAL_STATUSES.has(rs)) return false;
  if (rs === 'done' && st && !NON_SUCCESS_TERMINAL_STATUSES.has(st)) return true;
  return false;
}
