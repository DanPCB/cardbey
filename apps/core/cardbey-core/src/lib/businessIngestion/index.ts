/**
 * Business Ingestion Foundation (V1) — public API.
 */

export * from './types.js';
export * from './adapters/index.js';
export { BusinessNormalizer, businessNormalizer } from './BusinessNormalizer.js';
export { EntityResolver, entityResolver, matchEntities } from './EntityResolver.js';
export { BusinessQualityScorer, businessQualityScorer } from './BusinessQualityScorer.js';
export {
  SEED_VERIFICATION_STATUSES,
  buildIngestedSeedRecord,
  promoteSeedToClaimable,
  applySeedStatusTransition,
  canTransitionSeedStatus,
} from './SeedGovernance.js';
export {
  SeedStoreBuilder,
  seedStoreBuilder,
  buildSeedStoreDraft,
  buildSeedStorePreview,
} from './SeedStoreBuilder.js';
export { submitSeedClaim, activateVerifiedSeed } from './ClaimFlow.js';
export { linkSeedAfterPublish, parseDraftInputForSeedLink } from './linkSeedAfterPublish.js';
export {
  suggestAutoApproval,
  canPromoteToClaimable,
  AUTO_APPROVAL_MIN_QUALITY_SCORE,
  QA_FLAG_HERO_MISSING,
  APPROVE_COMPLETENESS_BLOCKERS,
} from './QaQualityGates.js';
export {
  appendQaAuditEntry,
  listQaAuditEntries,
  resetQaAuditForTests,
} from './QaAuditLog.js';
export {
  listQaQueue,
  listClaimableSeeds,
  approveSeed,
  rejectSeed,
  markSeedDuplicate,
  mergeSeedIntoCanonical,
  sendSeedBackToReview,
  enrichQueueItem,
  isClaimableSeed,
} from './QaPromotionService.js';
export {
  listSeedRecords,
  getSeedRecordById,
  upsertSeedRecords,
  listIngestionRuns,
  buildIngestionDashboardMetrics,
  resetIngestionStoreForTests,
  resetIngestionDataForTests,
} from './IngestionRepository.js';
export {
  createRun as createIngestionRun,
  getRun as getIngestionRun,
  listRuns as listIngestionRunRecords,
  summarizeRun as summarizeIngestionRun,
} from './BusinessIngestionRunRepository.js';
export {
  recordSeedLifecycleTransition,
  listSeedLifecycleTransitions,
} from './BusinessSeedStatusTransitionRepository.js';
export {
  toGovernedLifecycleStage,
  buildSeedLifecycleFunnel,
  lifecycleStageLabel,
  GOVERNED_NON_STORE_ACTIONS,
} from './seedLifecycleGovernance.js';
export { IngestionPipeline, ingestionPipeline, runIngestion } from './IngestionPipeline.js';
export { persistSeedStoreDraft, attachStoreToSeed } from './seedStorePersistence.js';
export { transferSeedStoreToOwner, ensureSeedStoreExists } from './SeedOwnershipTransfer.js';
export { findLiveBusinessDuplicate } from './LiveDuplicateCheck.js';
export { maskPhone, maskEmail } from './contactMasking.js';
export {
  canPubliclyClaim,
  buildPublicClaimPreview,
  getPublicClaimPreviewBySeedId,
  startSeedClaim,
  verifySeedClaimProof,
  activateSeedAfterOwnerConfirmation,
  rejectSeedClaim,
  listClaimsByStatus,
  buildClaimQueueMetrics,
  enrichClaimsForDashboard,
} from './ClaimBridgeService.js';
export {
  translateSeedToPublicLifecycle,
  publicLifecycleLabel,
  DISCOVERED_BUSINESS_BADGE,
} from './publicLifecycle.js';
export {
  buildPublicDiscoveryCard,
  listPublicDiscoveryCards,
} from './DiscoveryCardService.js';
export { resolveDiscoveryCardHero } from './DiscoveryCardHeroResolver.js';
export {
  listClaimRequests,
  getClaimRequestById,
  resetClaimRequestsForTests,
} from './ClaimRequestStore.js';
export {
  appendClaimAuditEntry,
  listClaimAuditEntries,
  resetClaimAuditForTests,
} from './ClaimAuditLog.js';
export {
  buildSourceKey,
  buildIdentityFingerprint,
  reconcileIngestionSeeds,
  findExistingSeed,
  mergeIncomingSeed,
} from './seedIdempotency.js';
export {
  buildPilotBatchMetrics,
  buildAllPilotBatchMetrics,
  filterSeedsByBatch,
  MELBOURNE_BATCH0_ID,
} from './buildPilotBatchMetrics.js';
