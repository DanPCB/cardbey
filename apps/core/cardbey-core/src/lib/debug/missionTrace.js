/**
 * Mission ID propagation trace — logs a single missionId through intake → tool → SSE → UI.
 * Additive only; safe in production (structured console).
 */

/**
 * @param {string} stage
 * @param {Record<string, unknown>} [data]
 */
export function traceMission(stage, data = {}) {
  const { missionId, traceId, ...rest } = data && typeof data === 'object' ? data : {};
  console.log(`[MISSION_TRACE] ${stage}`, {
    missionId: missionId ?? null,
    traceId: traceId ?? null,
    ...rest,
  });
}
