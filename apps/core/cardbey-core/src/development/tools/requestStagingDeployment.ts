// apps/core/cardbey-core/src/development/tools/requestStagingDeployment.ts

import { DevelopmentOrchestrator } from '../orchestrator/DevelopmentOrchestrator';

export async function requestStagingDeployment(
  orchestrator: DevelopmentOrchestrator,
  missionId: string
) {
  try {
    const mission = await orchestrator.getMission(missionId);
    if (!mission) {
      throw new Error(`Mission ${missionId} not found`);
    }

    if (mission.state !== 'READY_FOR_STAGING') {
      throw new Error(`Cannot deploy to staging in state: ${mission.state}`);
    }

    const deployment = await orchestrator.deployToStaging(missionId);
    
    return {
      success: true,
      deployment,
      message: `Staging deployment initiated for mission ${missionId}`
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}