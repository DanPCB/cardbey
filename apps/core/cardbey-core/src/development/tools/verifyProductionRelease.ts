// apps/core/cardbey-core/src/development/tools/verifyProductionRelease.ts

import { DevelopmentOrchestrator } from '../orchestrator/DevelopmentOrchestrator';

export async function verifyProductionRelease(
  orchestrator: DevelopmentOrchestrator,
  missionId: string
) {
  try {
    const mission = await orchestrator.getMission(missionId);
    if (!mission) {
      throw new Error(`Mission ${missionId} not found`);
    }

    if (mission.state !== 'PRODUCTION_DEPLOYING') {
      throw new Error(`Cannot verify production in state: ${mission.state}`);
    }

    const updatedMission = await orchestrator.verifyProduction(missionId);
    
    return {
      success: true,
      mission: updatedMission,
      message: `Production release verified for mission ${missionId}`
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}