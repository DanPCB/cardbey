// apps/core/cardbey-core/src/development/tools/submitDevelopmentPatchReview.ts

import { DevelopmentOrchestrator } from '../orchestrator/DevelopmentOrchestrator';

export async function submitDevelopmentPatchReview(
  orchestrator: DevelopmentOrchestrator,
  missionId: string
) {
  try {
    const mission = await orchestrator.getMission(missionId);
    if (!mission) {
      throw new Error(`Mission ${missionId} not found`);
    }

    if (mission.state !== 'AWAITING_CODE_REVIEW') {
      throw new Error(`Cannot submit for review in state: ${mission.state}`);
    }

    // Get the patch and create PR
    const pr = await orchestrator.createPullRequest(missionId);
    
    return {
      success: true,
      pr,
      message: `Pull request created for mission ${missionId}: ${pr.url}`
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}