// apps/core/cardbey-core/src/development/tools/proposeDevelopmentDesign.ts

import { DevelopmentOrchestrator } from '../orchestrator/DevelopmentOrchestrator';
import { DevelopmentPlan } from '../types/DevelopmentPlan';

export async function proposeDevelopmentDesign(
  orchestrator: DevelopmentOrchestrator,
  missionId: string,
  design: Partial<DevelopmentPlan>
) {
  try {
    const mission = await orchestrator.getMission(missionId);
    if (!mission) {
      throw new Error(`Mission ${missionId} not found`);
    }

    if (mission.state !== 'DESIGN_PROPOSED') {
      throw new Error(`Cannot propose design in state: ${mission.state}`);
    }

    const plan = await orchestrator.proposeDesign(missionId, design);
    
    return {
      success: true,
      plan,
      message: `Design proposed for mission ${missionId}`
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}