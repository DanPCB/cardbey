// apps/core/cardbey-core/src/development/tools/createDevelopmentMission.ts

import { DevelopmentOrchestrator } from '../orchestrator/DevelopmentOrchestrator';
import { CreateDevelopmentMissionInput } from '../types/DevelopmentMission';

export async function createDevelopmentMission(
  orchestrator: DevelopmentOrchestrator,
  input: CreateDevelopmentMissionInput
) {
  try {
    // Validate input
    if (!input.title) throw new Error('Title is required');
    if (!input.request) throw new Error('Request description is required');
    if (!input.expectedOutcome) throw new Error('Expected outcome is required');
    if (!input.requestedBy) throw new Error('RequestedBy is required');

    // Create the mission
    const mission = await orchestrator.createMission(input);
    
    return {
      success: true,
      mission,
      message: `Development mission ${mission.id} created successfully`
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}