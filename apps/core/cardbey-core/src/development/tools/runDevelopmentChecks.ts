// apps/core/cardbey-core/src/development/tools/runDevelopmentChecks.ts

import { DevelopmentOrchestrator } from '../orchestrator/DevelopmentOrchestrator';

export async function runDevelopmentChecks(
  orchestrator: DevelopmentOrchestrator,
  missionId: string
) {
  try {
    const mission = await orchestrator.getMission(missionId);
    if (!mission) {
      throw new Error(`Mission ${missionId} not found`);
    }

    if (mission.state !== 'PATCH_READY') {
      throw new Error(`Cannot run checks in state: ${mission.state}`);
    }

    const checks = await orchestrator.runChecks(missionId);
    
    const allPassed = checks.every(c => c.status === 'PASSED');
    
    return {
      success: allPassed,
      checks,
      message: allPassed 
        ? `All checks passed for mission ${missionId}`
        : `Some checks failed for mission ${missionId}`
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}