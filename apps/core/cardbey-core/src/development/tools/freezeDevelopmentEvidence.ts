// apps/core/cardbey-core/src/development/tools/freezeDevelopmentEvidence.ts

import { DevelopmentOrchestrator } from '../orchestrator/DevelopmentOrchestrator';
import { DevelopmentEvidence } from '../types/DevelopmentEvidence';

export async function freezeDevelopmentEvidence(
  orchestrator: DevelopmentOrchestrator,
  missionId: string,
  evidence: Partial<DevelopmentEvidence>
) {
  try {
    const mission = await orchestrator.getMission(missionId);
    if (!mission) {
      throw new Error(`Mission ${missionId} not found`);
    }

    if (mission.state !== 'REQUESTED' && mission.state !== 'EVIDENCE_REQUIRED') {
      throw new Error(`Cannot freeze evidence in state: ${mission.state}`);
    }

    const updatedMission = await orchestrator.freezeEvidence(missionId, evidence);
    
    return {
      success: true,
      mission: updatedMission,
      message: `Evidence frozen for mission ${missionId}`
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}