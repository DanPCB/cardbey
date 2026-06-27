/**
 * Performer-first BusinessCandidate — public API.
 * Batch 001 onboarding: Discovery → Candidate → Performer Mission → Store Draft → Publish.
 */

export * from './types.js';
export * from './batch001Config.js';
export * from './contentProvenance.js';
export * from './crmOverlay.js';
export { runRealLocalDiscovery, REAL_LOCAL_PILOT_TARGET_COUNT } from './realLocalDiscoveryService.js';
export {
  listCandidatesPendingQa,
  approveCandidateForClaiming,
  rejectCandidateQa,
} from './candidateQaService.js';
export { checkCandidateDuplicate, isPendingQaCandidate } from './candidateDedupe.js';
export {
  listBusinessCandidates,
  listBusinessCandidatesByBatch,
  getBusinessCandidateById,
  getBusinessCandidateByDedupeKey,
  upsertBusinessCandidates,
  saveBusinessCandidate,
  appendCandidateTransition,
  listCandidateTransitions,
  resetBusinessCandidatesForTests,
  buildCandidateDedupeKey,
} from './candidateRepository.js';
export {
  canTransitionCandidateStatus,
  transitionCandidateStatus,
  attachStoreDraftToCandidate,
  attachMissionToCandidate,
} from './candidateLifecycle.js';
export {
  emitCandidateRuntimeEvent,
  emitBusinessDiscovered,
  emitCandidateStatusChanged,
} from './candidateRuntimeEvents.js';
export { createBusinessOnboardingMission } from './businessOnboardingMission.js';
export { ingestDiscoveredCandidates } from './candidateIngestionPipeline.js';
export { buildBatchOnboardingMetrics } from './buildBatchMetrics.js';
