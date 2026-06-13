/**
 * Structured logs for SQLite write contention / critical write lane.
 */

/**
 * @param {string} event
 * @param {Record<string, unknown>} [fields]
 */
function emit(event, fields = {}) {
  const payload = { event, ts: new Date().toISOString(), ...fields };
  console.log(JSON.stringify(payload));
}

/**
 * @param {{ operation?: string; missionId?: string | null; queueDepth?: number; reason?: string }} fields
 */
export function emitSqliteWriteWait(fields = {}) {
  emit('SQLITE_WRITE_WAIT', {
    operation: fields.operation ?? 'unknown',
    ...(fields.missionId ? { missionId: fields.missionId } : {}),
    ...(fields.queueDepth != null ? { queueDepth: fields.queueDepth } : {}),
    ...(fields.reason ? { reason: fields.reason } : {}),
  });
}

/**
 * @param {{ operation?: string; missionId?: string | null; attempt?: number; code?: string }} fields
 */
export function emitSqliteWriteRetry(fields = {}) {
  emit('SQLITE_WRITE_RETRY', {
    operation: fields.operation ?? 'unknown',
    attempt: fields.attempt ?? 1,
    ...(fields.missionId ? { missionId: fields.missionId } : {}),
    ...(fields.code ? { code: fields.code } : {}),
  });
}

/**
 * @param {{ operation?: string; missionId?: string | null; attempt?: number; code?: string }} fields
 */
export function emitSqliteWriteTimeout(fields = {}) {
  emit('SQLITE_WRITE_TIMEOUT', {
    operation: fields.operation ?? 'unknown',
    ...(fields.missionId ? { missionId: fields.missionId } : {}),
    ...(fields.attempt != null ? { attempt: fields.attempt } : {}),
    ...(fields.code ? { code: fields.code } : {}),
  });
}

/**
 * @param {{ operation?: string; missionId?: string | null }} fields
 */
export function emitSqliteCriticalWriteStarted(fields = {}) {
  emit('SQLITE_CRITICAL_WRITE_STARTED', {
    operation: fields.operation ?? 'unknown',
    ...(fields.missionId ? { missionId: fields.missionId } : {}),
  });
}

/**
 * @param {{ operation?: string; missionId?: string | null; ms?: number }} fields
 */
export function emitSqliteCriticalWriteCompleted(fields = {}) {
  emit('SQLITE_CRITICAL_WRITE_COMPLETED', {
    operation: fields.operation ?? 'unknown',
    ...(fields.missionId ? { missionId: fields.missionId } : {}),
    ...(fields.ms != null ? { ms: fields.ms } : {}),
  });
}
