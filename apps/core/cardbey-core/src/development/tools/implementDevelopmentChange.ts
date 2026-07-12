// apps/core/cardbey-core/src/development/tools/implementDevelopmentChange.ts

import { DevelopmentOrchestrator } from '../orchestrator/DevelopmentOrchestrator';

export async function implementDevelopmentChange(
  orchestrator: DevelopmentOrchestrator,
  missionId: string
) {
  try {
    const mission = await orchestrator.getMission(missionId);
    if (!mission) {
      throw new Error(`Mission ${missionId} not found`);
    }

    if (mission.state !== 'IMPLEMENTING') {
      throw new Error(`Cannot implement change in state: ${mission.state}`);
    }

    const patch = await orchestrator.implementChange(missionId);
    
    return {
      success: true,
      patch,
      message: `Implementation completed for mission ${missionId}`
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}