/**
 * Phase 2.3-B — orchestration stability metrics (in-process, observational).
 * Counters are always safe to increment; flags gate behavior elsewhere.
 */

const metrics = {
  pipelineUpdateRetries: 0,
  pipelineUpdateTimeouts: 0,
  missionUpdateRetries: 0,
  missionUpdateSkips: 0,
  blackboardAppendCount: 0,
  blackboardAppendLatencyMsTotal: 0,
  blackboardAppendFailures: 0,
  prismaObservations: 0,
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** @param {unknown} err */
export function isPrismaSocketTimeoutError(err) {
  if (!err || typeof err !== 'object') return false;
  const code = /** @type {{ code?: string }} */ (err).code;
  if (code === 'P1008') return true;
  const msg = String(/** @type {{ message?: string }} */ (err).message ?? '').toLowerCase();
  return msg.includes('socket timeout') || msg.includes('timed out fetching a new connection');
}

/** @param {unknown} err */
export function isSqliteBusyError(err) {
  if (!err || typeof err !== 'object') return false;
  const msg = String(/** @type {{ message?: string }} */ (err).message ?? '').toLowerCase();
  return msg.includes('sqlite_busy') || msg.includes('database is locked');
}

/** @param {unknown} err */
export function isTransientSqliteWriteError(err) {
  return isPrismaSocketTimeoutError(err) || isSqliteBusyError(err);
}

/**
 * @param {{ retry?: boolean, timeout?: boolean }} obs
 */
export function recordPipelineUpdate(obs = {}) {
  if (obs.retry) metrics.pipelineUpdateRetries += 1;
  if (obs.timeout) metrics.pipelineUpdateTimeouts += 1;
}

/**
 * @param {{ retry?: boolean, skipped?: boolean }} obs
 */
export function recordMissionUpdate(obs = {}) {
  if (obs.retry) metrics.missionUpdateRetries += 1;
  if (obs.skipped) metrics.missionUpdateSkips += 1;
}

/**
 * @param {{ latencyMs?: number, ok?: boolean }} obs
 */
export function recordBlackboardAppend(obs = {}) {
  metrics.blackboardAppendCount += 1;
  if (typeof obs.latencyMs === 'number' && obs.latencyMs >= 0) {
    metrics.blackboardAppendLatencyMsTotal += obs.latencyMs;
  }
  if (obs.ok === false) metrics.blackboardAppendFailures += 1;
}

/**
 * @param {object} [_obs]
 */
export function recordPrismaObservation(_obs = {}) {
  metrics.prismaObservations += 1;
}

/** @returns {boolean} */
export function shouldYieldToMissionRuntime() {
  return false;
}

export function getOrchestrationStabilityMetricsSnapshot() {
  return { ...metrics };
}

export function resetOrchestrationStabilityMetricsForTests() {
  metrics.pipelineUpdateRetries = 0;
  metrics.pipelineUpdateTimeouts = 0;
  metrics.missionUpdateRetries = 0;
  metrics.missionUpdateSkips = 0;
  metrics.blackboardAppendCount = 0;
  metrics.blackboardAppendLatencyMsTotal = 0;
  metrics.blackboardAppendFailures = 0;
  metrics.prismaObservations = 0;
}

export { sleep };
