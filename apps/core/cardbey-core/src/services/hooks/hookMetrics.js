/**
 * In-memory hook metrics, rate limits, and rollback snapshots (no extra Prisma models).
 */

/** @type {Map<string, { executions: number; totalDuration: number; lastExecution: string|null }>} */
const skillMetrics = new Map();

/** @type {Map<string, number[]>} */
const userExecutionTimestamps = new Map();

/** @type {Map<string, object>} */
const rollbackSnapshots = new Map();

function metricsKey(skillId, userId) {
  return `${String(skillId ?? 'unknown')}:${String(userId ?? 'anonymous')}`;
}

export function recordSkillExecution(skillId, userId, durationMs = 0) {
  const key = metricsKey(skillId, userId);
  const current = skillMetrics.get(key) ?? { executions: 0, totalDuration: 0, lastExecution: null };
  skillMetrics.set(key, {
    executions: current.executions + 1,
    totalDuration: current.totalDuration + Math.max(0, Number(durationMs) || 0),
    lastExecution: new Date().toISOString(),
  });
}

export function getSkillMetrics(skillId, userId) {
  return skillMetrics.get(metricsKey(skillId, userId)) ?? null;
}

export function resetSkillMetricsForTests() {
  skillMetrics.clear();
  userExecutionTimestamps.clear();
  rollbackSnapshots.clear();
}

/**
 * @param {string} userId
 * @param {{ windowMs?: number; maxExecutions?: number }} [options]
 */
export function checkRateLimit(userId, options = {}) {
  const uid = String(userId ?? '').trim() || 'anonymous';
  const windowMs = Math.max(1000, Number(options.windowMs) || 60_000);
  const maxExecutions = Math.max(1, Number(options.maxExecutions) || 30);
  const now = Date.now();
  const windowStart = now - windowMs;

  const stamps = (userExecutionTimestamps.get(uid) || []).filter((t) => t >= windowStart);
  if (stamps.length >= maxExecutions) {
    return { limited: true, count: stamps.length, windowMs, maxExecutions };
  }

  stamps.push(now);
  userExecutionTimestamps.set(uid, stamps);
  return { limited: false, count: stamps.length, windowMs, maxExecutions };
}

/**
 * @param {string} key
 * @param {object} snapshot
 */
export function stashRollbackSnapshot(key, snapshot) {
  rollbackSnapshots.set(String(key), { ...snapshot, stashedAt: new Date().toISOString() });
}

/**
 * @param {string} key
 */
export function popRollbackSnapshot(key) {
  const k = String(key);
  const snap = rollbackSnapshots.get(k);
  rollbackSnapshots.delete(k);
  return snap ?? null;
}

export function getRollbackSnapshotsForTests() {
  return new Map(rollbackSnapshots);
}
