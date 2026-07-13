// apps/core/cardbey-core/src/development/tools/prepareDevelopmentWorkspace.ts

import { DevelopmentOrchestrator } from '../orchestrator/DevelopmentOrchestrator';

export async function prepareDevelopmentWorkspace(
  orchestrator: DevelopmentOrchestrator,
  missionId: string
) {
  try {
    const mission = await orchestrator.getMission(missionId);
    if (!mission) {
      throw new Error(`Mission ${missionId} not found`);
    }

    if (mission.state !== 'WORKSPACE_PREPARING') {
      throw new Error(`Cannot prepare workspace in state: ${mission.state}`);
    }

    const workspace = await orchestrator.prepareWorkspace(missionId);
    
    return {
      success: true,
      workspace,
      message: `Workspace prepared for mission ${missionId}`
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}