// apps/core/cardbey-core/src/development/tools/openDevelopmentPullRequest.ts

import { DevelopmentOrchestrator } from '../orchestrator/DevelopmentOrchestrator';

export async function openDevelopmentPullRequest(
  orchestrator: DevelopmentOrchestrator,
  missionId: string
) {
  try {
    const mission = await orchestrator.getMission(missionId);
    if (!mission) {
      throw new Error(`Mission ${missionId} not found`);
    }

    if (mission.state !== 'PR_CREATED') {
      throw new Error(`Cannot open PR in state: ${mission.state}`);
    }

    const pr = await orchestrator.createPullRequest(missionId);
    
    return {
      success: true,
      pr,
      message: `Pull request ${pr.number} opened for mission ${missionId}`
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}