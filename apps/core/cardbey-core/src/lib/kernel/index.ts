/**
 * Cardbey AI Operating Kernel — public Phase 0 surface.
 * @see docs/COGNITIVE_KERNEL_SPEC.md
 */

export * from './types.js';
export * from './laws.js';
export * from './registries.js';
export * from './ingress.js';
export * from './ingress/intakeEvidenceBarrier.js';
export * from './ingress/intakeEvidence.types.js';
export * from './ingress/evidenceAssertions.js';
export * from './ingress/classifierEvidenceInput.js';
export * from './missionContract.js';
export * from './spineAuthority.js';
export * from './attachmentRealityStreamSidecar.js';
export * from './passive/passivePipeline.js';
export * from './passive/persist.js';
export * from './passive/parityLog.js';
export * from './passive/parityMetrics.js';
export * from './passive/intakeParityObserver.js';
export * from './passive/streamLookup.js';
export * from './perception/attachmentPerceptionPlugin.js';
export * from './evidence/buildEvidenceView.js';
export * from './reasoning/attachmentAlternativesReasoner.js';
export * from './calibration/decisionRecord.types.js';
export * from './calibration/buildDecisionRecord.js';
export * from './calibration/classifyDisagreement.js';
export * from './calibration/confidenceDelta.js';
export * from './calibration/calibrationStore.js';
export * from './calibration/calibrationMetrics.js';
export * from './calibration/calibrationDashboardData.js';

export { KERNEL_VERSION } from './laws.js';
