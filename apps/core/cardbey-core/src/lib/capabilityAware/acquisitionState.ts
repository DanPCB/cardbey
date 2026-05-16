/**
 * Acquisition state model only.
 * No loops or execution side effects.
 */

import type {
  AcquisitionStatus,
  CapabilityAcquisitionState,
  ExecutionChoice,
  ExecutionMode,
} from './types.ts';

export function createAcquisitionState(
  requirementId: string,
): CapabilityAcquisitionState {
  return {
    requirementId,
    status: 'not_needed',
  };
}

export function updateAcquisitionState(
  state: CapabilityAcquisitionState,
  status: AcquisitionStatus,
  chosenPath?: ExecutionMode,
  notes?: string,
): CapabilityAcquisitionState {
  return {
    ...state,
    status,
    ...(chosenPath != null ? { chosenPath } : {}),
    ...(notes != null ? { notes } : {}),
  };
}

export function buildAcquisitionMap(
  choices: ExecutionChoice[],
): CapabilityAcquisitionState[] {
  return choices.map((choice) => {
    let status: AcquisitionStatus = 'not_needed';
    if (choice.chosenMode === 'blocked') status = 'blocked';
    if (choice.chosenMode === 'child_agent') status = 'delegated';
    if (choice.chosenMode === 'user_input') status = 'awaiting_user';

    return {
      requirementId: choice.requirementId,
      status,
      chosenPath: choice.chosenMode,
    };
  });
}
