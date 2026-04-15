/**
 * Acquisition progress model — v1 state only, no autonomous loop.
 */

import type { CapabilityAcquisitionState, ExecutionMode, RequirementResolution } from './types.ts';

function inferStatus(
  r: RequirementResolution,
  chosenPath: ExecutionMode | undefined,
): CapabilityAcquisitionState['status'] {
  if (r.state === 'ready') return 'acquired';
  if (r.state === 'partial') return 'substituted';
  if (r.state === 'missing' && r.requiresUserInput) return 'awaiting_user';
  if (r.state === 'missing') return 'blocked';
  if (r.state === 'fetchable') return 'pending';
  if (r.state === 'substitutable') return 'substituted';
  if (r.state === 'delegatable') return 'delegated';
  if (r.state === 'blocked') return 'blocked';
  if (chosenPath === 'user_input') return 'awaiting_user';
  return 'pending';
}

export function buildAcquisitionStatesFromResolutions(
  resolutions: RequirementResolution[],
  executionChoices: { requirementId: string; chosenMode: ExecutionMode }[],
): CapabilityAcquisitionState[] {
  const modeMap = new Map(executionChoices.map((c) => [c.requirementId, c.chosenMode]));
  return resolutions.map((r) => {
    const chosenPath = modeMap.get(r.requirementId);
    return {
      requirementId: r.requirementId,
      status: inferStatus(r, chosenPath),
      chosenPath,
      notes: r.notes,
    };
  });
}
