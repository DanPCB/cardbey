// apps/core/cardbey-core/src/development/tools/approveDevelopmentDesign.ts

import { DevelopmentOrchestrator } from '../orchestrator/DevelopmentOrchestrator';

export async function approveDevelopmentDesign(
  orchestrator: DevelopmentOrchestrator,
  missionId: string,
  approver: string
) {
  try {
    const mission = await orchestrator.getMission(missionId);
    if (!mission) {
      throw new Error(`Mission ${missionId} not found`);
    }

    if (mission.state !== 'AWAITING_DESIGN_APPROVAL') {
      throw new Error(`Cannot approve design in state: ${mission.state}`);
    }

    const updatedMission = await orchestrator.approveDesign(missionId, approver);
    
    return {
      success: true,
      mission: updatedMission,
      message: `Design approved for mission ${missionId} by ${approver}`
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}