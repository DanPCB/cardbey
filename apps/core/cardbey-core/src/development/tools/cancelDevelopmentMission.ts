// apps/core/cardbey-core/src/development/tools/cancelDevelopmentMission.ts

import { DevelopmentOrchestrator } from '../orchestrator/DevelopmentOrchestrator';

export async function cancelDevelopmentMission(
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
      throw new Error(`Cannot cancel mission in state: ${mission.state}`);
    }

    const updatedMission = await orchestrator.cancelMission(missionId, reason);
    
    return {
      success: true,
      mission: updatedMission,
      message: `Mission ${missionId} cancelled: ${reason}`
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}