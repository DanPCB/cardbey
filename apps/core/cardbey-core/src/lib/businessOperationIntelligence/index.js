/**
 * Business Operation Intelligence — Phase A public surface.
 */

export {
  KNOWLEDGE_STATES,
  KNOWLEDGE_STATE_AUTHORITY,
  knowledgeAuthority,
  canOverwriteKnowledgeState,
  isKnowledgeState,
} from './knowledgeStates.js';

export {
  BUSINESS_CONTEXT_MODES,
  BUSINESS_CONTEXT_STATUS,
  BUSINESS_CONTEXT_SCHEMA_VERSION,
  createContextId,
  createKnowledgeItem,
  createEmptyBusinessContext,
  projectIdentityFromKnowledge,
  validateBusinessContextShape,
} from './types.js';

export {
  parseBusinessInput,
  inferModeFromText,
  looksLikeNamedExistingBusiness,
  extractLocation,
  extractWebsite,
  extractOperatingModel,
  extractLikelyName,
  extractBusinessType,
} from './parseBusinessInput.js';

export {
  understandBusinessContext,
  upsertKnowledge,
  applyDiscoveredCandidate,
} from './understandBusinessContext.js';

export {
  adjustBusinessContext,
  selectResolutionCandidate,
  continueWithDescription,
  confirmBusinessContext,
  applyTypeClarification,
} from './confirmBusinessContext.js';

export {
  BUSINESS_SNAPSHOT_SCHEMA_VERSION,
  SNAPSHOT_BUDGETS,
  createEmptyBusinessSnapshot,
  field,
  identityFromContext,
} from './snapshotTypes.js';

export { probeWebsiteForSnapshot } from './lightWebsiteProbe.js';
export { buildExistingBusinessSnapshot } from './buildExistingSnapshot.js';
export { buildIntendedBusinessSnapshot } from './buildIntendedSnapshot.js';
export { buildBusinessSnapshot } from './buildBusinessSnapshot.js';
export {
  recordBusinessOperationEvent,
  BUSINESS_OPERATION_EVENTS,
  BUSINESS_OPERATION_PUBLIC_CLIENT_EVENTS,
} from './snapshotAttribution.js';

export { buildFullAnalysisPreview } from './fullAnalysisPreview.js';

export {
  ANALYSIS_STAGE_STATUS,
  EXISTING_ANALYSIS_STAGES,
  INTENDED_ANALYSIS_STAGES,
  stageDefinitionsForMode,
} from './analysisStages.js';

export {
  startBusinessAnalysis,
  advanceBusinessAnalysis,
  getBusinessAnalysis,
} from './runBusinessAnalysis.js';

export { clearAnalysisSessions } from './analysisSessionStore.js';

export {
  BUSINESS_ANALYSIS_REPORT_SCHEMA_VERSION,
  FULL_ANALYSIS_EXISTING_STAGES,
  FULL_ANALYSIS_INTENDED_STAGES,
  fullAnalysisStagesForMode,
  createEmptyBusinessAnalysisReport,
  CARDBEY_ACTIONS,
} from './fullAnalysisTypes.js';

export { discoverCompetitorCandidates, COMPARISON_CLASS } from './competitorCandidates.js';
export {
  assessBusinessContextSufficiency,
  isGenericBusinessLabel,
  hasTypeClarification,
} from './businessContextSufficiency.js';
export { buildComparisonSearchQueries } from './comparisonQueries.js';
export { buildExistingFullAnalysis } from './buildExistingFullAnalysis.js';
export { buildIntendedFullAnalysis } from './buildIntendedFullAnalysis.js';
export { extractBusinessSignals, SIGNAL_TYPES, createBusinessSignal } from './businessSignals.js';
export { resolveVerticalArchetype, VERTICAL_ARCHETYPES, VERTICAL_PACKS } from './verticalPacks.js';
export { buildVerticalIntelligence } from './recommendationEngine.js';
export {
  classifyRecommendationSpecificity,
  applySpecificityGate,
  SPECIFICITY,
} from './specificityGate.js';
export {
  startFullAnalysis,
  advanceFullAnalysis,
  getFullAnalysis,
  isBusinessFullAnalysisV1Enabled,
  isBusinessOperationPilotV1Enabled,
} from './runFullAnalysis.js';

export function isBusinessOperationIntelligenceV1Enabled() {
  const raw = String(process.env.ENABLE_BUSINESS_OPERATION_INTELLIGENCE_V1 ?? '')
    .trim()
    .toLowerCase();
  if (raw === 'true' || raw === '1' || raw === 'on' || raw === 'yes') return true;
  if (raw === 'false' || raw === '0' || raw === 'off' || raw === 'no') return false;
  const deployEnv = String(process.env.CARDEY_DEPLOY_ENV || process.env.RENDER_SERVICE_NAME || '')
    .trim()
    .toLowerCase();
  if (deployEnv.includes('staging') || deployEnv === 'development' || deployEnv === 'dev') {
    return true;
  }
  return process.env.NODE_ENV !== 'production';
}
