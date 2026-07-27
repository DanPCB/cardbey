// apps/core/cardbey-core/src/development/tools/analyseDevelopmentImpact.ts

import { DevelopmentOrchestrator } from '../orchestrator/DevelopmentOrchestrator';

export async function analyseDevelopmentImpact(
  orchestrator: DevelopmentOrchestrator,
  missionId: string
) {
  try {
    const mission = await orchestrator.getMission(missionId);
    if (!mission) {
      throw new Error(`Mission ${missionId} not found`);
    }

    if (mission.state !== 'ANALYSING') {
      throw new Error(`Cannot analyse impact in state: ${mission.state}`);
    }

    const report = await orchestrator.analyseImpact(missionId);
    
    return {
      success: true,
      report,
      message: `Impact analysis completed for mission ${missionId}`
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}