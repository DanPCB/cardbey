// apps/core/cardbey-core/src/development/tools/observeCIResult.ts

import { DevelopmentOrchestrator } from '../orchestrator/DevelopmentOrchestrator';

export async function observeCIResult(
  orchestrator: DevelopmentOrchestrator,
  missionId: string
) {
  try {
    const mission = await orchestrator.getMission(missionId);
    if (!mission) {
      throw new Error(`Mission ${missionId} not found`);
    }

    if (mission.state !== 'CI_RUNNING' && mission.state !== 'CI_FAILED') {
      throw new Error(`Cannot observe CI in state: ${mission.state}`);
    }

    // Simulate CI observation - in production, this would check GitHub Actions
    const checks = await orchestrator.getCheckRuns(missionId);
    
    const allPassed = checks.every(c => c.status === 'PASSED');
    
    if (allPassed) {
      await orchestrator.updateState(missionId, 'READY_FOR_STAGING');
    } else {
      await orchestrator.updateState(missionId, 'CI_FAILED');
    }
    
    return {
      success: allPassed,
      checks,
      message: allPassed 
        ? `CI passed for mission ${missionId}`
        : `CI failed for mission ${missionId}`
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}