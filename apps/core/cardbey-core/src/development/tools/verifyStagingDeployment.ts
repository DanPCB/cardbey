// apps/core/cardbey-core/src/development/tools/verifyStagingDeployment.ts

import { DevelopmentOrchestrator } from '../orchestrator/DevelopmentOrchestrator';

export async function verifyStagingDeployment(
  orchestrator: DevelopmentOrchestrator,
  missionId: string
) {
  try {
    const mission = await orchestrator.getMission(missionId);
    if (!mission) {
      throw new Error(`Mission ${missionId} not found`);
    }

    if (mission.state !== 'STAGING_DEPLOYING') {
      throw new Error(`Cannot verify staging in state: ${mission.state}`);
    }

    const deployment = await orchestrator.verifyStaging(missionId);
    
    return {
      success: true,
      deployment,
      message: `Staging verified for mission ${missionId}`
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}