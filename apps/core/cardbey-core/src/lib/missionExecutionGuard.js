/**
 * In-process guard: mission pipeline runner is actively executing (SQLite write isolation).
 * Used to suppress/debounce non-critical telemetry in local dev during hot paths.
 */

/** @type {Set<string>} */
const activeMissionIds = new Set();

/**
 * @param {string} missionId
 */
export function markMissionPipelineExecuting(missionId) {
  const id = typeof missionId === 'string' ? missionId.trim() : '';
  if (id) activeMissionIds.add(id);
}

/**
 * @param {string} missionId
 */
export function clearMissionPipelineExecuting(missionId) {
  const id = typeof missionId === 'string' ? missionId.trim() : '';
  if (id) activeMissionIds.delete(id);
}

/** @returns {boolean} */
export function hasActiveMissionPipelineExecution() {
  return activeMissionIds.size > 0;
}

/**
 * @param {string} missionId
 * @returns {boolean}
 */
export function isMissionPipelineExecuting(missionId) {
  const id = typeof missionId === 'string' ? missionId.trim() : '';
  return id ? activeMissionIds.has(id) : false;
}

/** @internal tests */
export function resetMissionExecutionGuardForTests() {
  activeMissionIds.clear();
}
