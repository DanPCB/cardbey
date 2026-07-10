/**
 * In-memory store for frozen intake evidence bundles (by stream / evidence id).
 */

import type { IntakeEvidenceBundle } from './intakeEvidence.types.js';

const byStreamId = new Map<string, IntakeEvidenceBundle>();
const byEvidenceId = new Map<string, IntakeEvidenceBundle>();

export function saveIntakeEvidenceBundle(bundle: IntakeEvidenceBundle): IntakeEvidenceBundle {
  const frozen = deepFreeze(structuredClone(bundle)) as IntakeEvidenceBundle;
  byStreamId.set(frozen.streamId, frozen);
  byEvidenceId.set(frozen.evidenceView.evidenceId, frozen);
  return frozen;
}

export function getIntakeEvidenceBundleByStream(streamId: string): IntakeEvidenceBundle | undefined {
  return byStreamId.get(streamId);
}

export function getIntakeEvidenceBundleByEvidenceId(evidenceId: string): IntakeEvidenceBundle | undefined {
  return byEvidenceId.get(evidenceId);
}

function deepFreeze<T>(value: T): T {
  if (value == null || typeof value !== 'object') return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

export function __clearIntakeEvidenceStoreForTests(): void {
  byStreamId.clear();
  byEvidenceId.clear();
}
