/**
 * Cardbey AI Operating Kernel — constitutional law helpers.
 * docs/COGNITIVE_KERNEL_SPEC.md
 */

import type { MissionContract, RealityStreamEvent } from './types.js';

export const KERNEL_VERSION = '0.1.0';

export class KernelLawViolation extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'KernelLawViolation';
    this.code = code;
  }
}

/**
 * Law 1 — Reality Stream events are append-only.
 * @param event
 */
export function assertRealityEventImmutable(event: RealityStreamEvent): void {
  if (!event?.eventId || !event?.streamId || !event?.recordedAt) {
    throw new KernelLawViolation(
      'REALITY_INVALID',
      'Reality stream events require eventId, streamId, and recordedAt',
    );
  }
}

/**
 * Law 2 — Mission Contract cannot be mutated after freeze.
 * @param contract
 * @param patch
 */
export function assertContractNotMutated(
  contract: MissionContract,
  patch: Partial<MissionContract>,
): void {
  if (!contract?.frozenAt) return;

  const frozenKeys: (keyof MissionContract)[] = [
    'missionFamily',
    'selectedAlternativeId',
    'userGoalSnapshot',
    'evidenceId',
    'reasoningFrameId',
    'decisionId',
    'builderId',
    'allowedCapabilities',
    'expectedAssetTypes',
    'uiCardFamily',
    'publishPipelineId',
  ];

  for (const key of frozenKeys) {
    if (key in patch && patch[key] !== undefined && patch[key] !== contract[key]) {
      throw new KernelLawViolation(
        'CONTRACT_MUTATION',
        `Mission contract is frozen; cannot mutate ${String(key)} after ${contract.frozenAt}`,
      );
    }
  }
}

/**
 * Structural invariant — one spine per mission.
 * @param existingContractId
 * @param incomingMissionId
 */
export function assertOneSpine(existingContractId: string | null, incomingMissionId: string): void {
  if (existingContractId && incomingMissionId) {
    // Phase 0: placeholder — Phase 3 will enforce against mission store.
    return;
  }
}
