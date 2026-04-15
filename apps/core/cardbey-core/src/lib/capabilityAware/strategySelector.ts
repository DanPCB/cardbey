/**
 * Advisory execution mode per requirement — does not execute or submit.
 */

import type { CapabilityMissionPhase, ExecutionChoice, PerformerRole, PremiumRoutingDecision, RequirementResolution } from './types.ts';
import { defaultPremiumDecision } from './policyGuards.ts';

export interface StrategySelectorInput {
  resolutions: RequirementResolution[];
  role: PerformerRole;
  phase: CapabilityMissionPhase;
  premiumDecision?: PremiumRoutingDecision;
  isGuest: boolean;
}

function resolutionToMode(r: RequirementResolution): ExecutionChoice['chosenMode'] {
  if (r.state === 'ready') return 'standard';
  if (r.state === 'partial') return 'standard';
  if (r.state === 'missing') return r.requiresUserInput ? 'user_input' : 'blocked';
  if (r.state === 'fetchable') return 'fallback';
  if (r.state === 'substitutable') return 'fallback';
  if (r.state === 'delegatable') return 'child_agent';
  if (r.state === 'blocked') return 'blocked';
  return 'standard';
}

export function selectExecutionStrategies(input: StrategySelectorInput): ExecutionChoice[] {
  void (input.premiumDecision ?? defaultPremiumDecision(input.isGuest));
  return input.resolutions.map((r) => {
    const chosenMode = resolutionToMode(r);
    let reason = `derived_from_${r.state}`;
    const approvalRequired = chosenMode === 'child_agent';
    const isDegraded = r.state === 'partial';
    if (chosenMode === 'child_agent') reason = 'delegatable_requirement_recommend_child';
    return {
      requirementId: r.requirementId,
      chosenMode,
      capabilityId: r.matchedCapabilityId ?? r.fallbackCapabilityId,
      reason,
      approvalRequired,
      isDegraded,
    };
  });
}
