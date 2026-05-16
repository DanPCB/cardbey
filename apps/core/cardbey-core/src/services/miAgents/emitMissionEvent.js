/**
 * Emit mission event (stub). Real implementation will write to MissionEvent table.
 */

/**
 * @param {{ missionId: string; intentId?: string; agent: string; type: string; payload?: unknown }} params
 */
export async function emitMissionEvent(params) {
  const { missionId, type, payload } = params;
  console.log('[emitMissionEvent]', { missionId, type, payload });
}
