/**
 * Store Readiness — public exports (V1 + Phase 2 + Phase 3).
 */

export {
  isStoreReadinessV1Enabled,
  isPilSellerAssistantV1Enabled,
  isStoreReadinessDraftsV1Enabled,
  getStoreReadinessFlags,
} from './featureFlags.js';

export { STORE_READINESS_RULE_CODES, runStoreReadinessRules } from './rules.js';
export {
  storeReadinessDestinations,
  DESTINATION_LABELS,
  resolveDestinationLabel,
} from './destinations.js';
export { createFinding, buildSectionFromFindings, severityWeight } from './findings.js';
export { normalizeEvidence, sanitizeEvidenceObject } from './evidence.js';
export { impactForFindingCode, IMPACT_BY_CODE } from './impact.js';
export {
  resolveBusinessVertical,
  runVerticalReadinessRules,
} from './verticalRules.js';
export {
  prioritizeFindings,
  groupForFinding,
  priorityScore,
  computeOverallScore,
  computeStatus,
} from './prioritize.js';
export {
  explainOverallScore,
  explainFinding,
  answerFromSnapshot,
} from './explain.js';
export { buildReadinessDiagnostics } from './diagnostics.js';
export {
  sanitizeStoreReadinessSnapshot,
  toSellerPilContext,
  isSellerPilContext,
  looksLikeSecretOrPath,
} from './sanitize.js';
export {
  buildStoreReadinessSnapshot,
  normalizeBusinessForReadiness,
  aggregateStoreReadiness,
  assertStoreOwner,
} from './aggregator.js';

export {
  DRAFT_TYPES,
  generateReadinessDraft,
  regenerateReadinessDraft,
  approveReadinessDraft,
  rejectReadinessDraft,
  applyReadinessDraft,
  listReadinessDraftsForStore,
  getReadinessDraft,
  resetReadinessDraftStoreForTests,
  listDraftApprovalRecords,
  draftTypeForFinding,
} from './drafts/index.js';
