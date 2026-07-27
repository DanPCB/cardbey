// apps/core/cardbey-core/src/development/tools/rollbackDevelopmentRelease.ts

import { DevelopmentOrchestrator } from '../orchestrator/DevelopmentOrchestrator';

export async function rollbackDevelopmentRelease(
  orchestrator: DevelopmentOrchestrator,
  missionId: string,
  reason: string
) {
  try {
    const mission = await orchestrator.getMission(missionId);
    if (!mission) {
      throw new Error(`Mission ${missionId} not found`);
    }

    if (['COMPLETED', 'ROLLED_BACK', 'CANCELLED'].includes(mission.state)) {
      throw new Error(`Cannot rollback mission in state: ${mission.state}`);
    }

    const updatedMission = await orchestrator.rollbackMission(missionId, reason);
    
    return {
      success: true,
      mission: updatedMission,
      message: `Release rolled back for mission ${missionId}: ${reason}`
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}