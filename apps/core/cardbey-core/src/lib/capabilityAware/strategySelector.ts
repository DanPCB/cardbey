/**
 * Strategy selection is advisory only.
 * It never executes work or changes routing.
 */

import type {
  CapabilityMissionPhase,
  ExecutionChoice,
  MissionRequirement,
  PerformerRole,
  PremiumUsageMode,
  RequirementResolution,
} from './types.ts';

function requirementMap(requirements: MissionRequirement[]): Map<string, MissionRequirement> {
  return new Map(requirements.map((requirement) => [requirement.id, requirement]));
}

export function selectStrategy(
  resolutions: RequirementResolution[],
  requirements: MissionRequirement[],
  role: PerformerRole,
  phase: CapabilityMissionPhase,
  premiumPolicy: PremiumUsageMode,
): ExecutionChoice[] {
  void role;
  void phase;
  const requirementsById = requirementMap(requirements);

  return resolutions.map((resolution): ExecutionChoice => {
    const requirement = requirementsById.get(resolution.requirementId);
    const importance = requirement?.importance ?? 'optional';
    const category = requirement?.category ?? '';

    switch (resolution.state) {
      case 'ready':
        return {
          requirementId: resolution.requirementId,
          chosenMode: 'standard',
          capabilityId: resolution.matchedCapabilityId,
          reason: 'capability available',
        };
      case 'partial':
        return {
          requirementId: resolution.requirementId,
          chosenMode: 'fallback',
          capabilityId: resolution.matchedCapabilityId ?? resolution.fallbackCapabilityId,
          reason: 'partial capability — using fallback',
        };
      case 'missing':
        if (importance === 'critical') {
          return {
            requirementId: resolution.requirementId,
            chosenMode: 'blocked',
            capabilityId: resolution.matchedCapabilityId,
            reason: 'critical capability missing',
          };
        }
        return {
          requirementId: resolution.requirementId,
          chosenMode: 'fallback',
          capabilityId: resolution.fallbackCapabilityId,
          reason: 'optional capability missing — skipping',
        };
      case 'fetchable':
        if (
          premiumPolicy === 'suggest_premium' &&
          ['payment', 'communication', 'scheduling'].includes(category)
        ) {
          return {
            requirementId: resolution.requirementId,
            chosenMode: 'user_input',
            capabilityId: resolution.matchedCapabilityId,
            reason: 'capability configurable — suggest user configure',
            approvalRequired: true,
          };
        }
        return {
          requirementId: resolution.requirementId,
          chosenMode: 'fallback',
          capabilityId: resolution.fallbackCapabilityId,
          reason: 'fetchable but not prompted in this policy mode',
        };
      case 'substitutable':
        return {
          requirementId: resolution.requirementId,
          chosenMode: 'fallback',
          capabilityId: resolution.fallbackCapabilityId ?? resolution.matchedCapabilityId,
          reason: 'substitute available',
        };
      case 'delegatable':
        return {
          requirementId: resolution.requirementId,
          chosenMode: 'child_agent',
          capabilityId: resolution.matchedCapabilityId,
          reason: 'delegatable to child agent',
          approvalRequired: true,
        };
      case 'blocked':
        return {
          requirementId: resolution.requirementId,
          chosenMode: 'blocked',
          capabilityId: resolution.matchedCapabilityId,
          reason: 'capability blocked',
        };
      default:
        return {
          requirementId: resolution.requirementId,
          chosenMode: 'fallback',
          capabilityId: resolution.fallbackCapabilityId,
          reason: 'optional capability missing — skipping',
        };
    }
  });
}

export function summarizeStrategy(choices: ExecutionChoice[]): {
  canProceed: boolean;
  blockedCount: number;
  premiumSuggested: boolean;
  childAgentRecommended: boolean;
  userInputRequired: boolean;
  blockedRequirements: string[];
} {
  const blockedRequirements = choices
    .filter((choice) => choice.chosenMode === 'blocked')
    .map((choice) => choice.requirementId);

  const blockedCount = blockedRequirements.length;

  return {
    canProceed: blockedCount === 0,
    blockedCount,
    premiumSuggested: choices.some(
      (choice) => choice.chosenMode === 'user_input' && choice.reason === 'capability configurable — suggest user configure',
    ),
    childAgentRecommended: choices.some((choice) => choice.chosenMode === 'child_agent'),
    userInputRequired: choices.some((choice) => choice.chosenMode === 'user_input'),
    blockedRequirements,
  };
}
