// apps/core/cardbey-core/src/development/tools/approveProductionRelease.ts

import { DevelopmentOrchestrator } from '../orchestrator/DevelopmentOrchestrator';

export async function approveProductionRelease(
  orchestrator: DevelopmentOrchestrator,
  missionId: string,
  approver: string
) {
  try {
    const mission = await orchestrator.getMission(missionId);
    if (!mission) {
      throw new Error(`Mission ${missionId} not found`);
    }

    if (mission.state !== 'AWAITING_RELEASE_APPROVAL') {
      throw new Error(`Cannot approve release in state: ${mission.state}`);
    }

    const deployment = await orchestrator.requestProductionRelease(missionId);
    
    return {
      success: true,
      deployment,
      message: `Production release approved for mission ${missionId} by ${approver}`
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}