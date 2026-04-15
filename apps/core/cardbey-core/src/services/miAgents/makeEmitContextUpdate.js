/**
 * Create an emitContextUpdate function for agents (stub). Real implementation will persist context updates.
 */
export function makeEmitContextUpdate(missionId, _agentLabel, _emitMissionEvent) {
  return async (update) => {
    console.log('[contextUpdate]', { missionId, update });
  };
}
