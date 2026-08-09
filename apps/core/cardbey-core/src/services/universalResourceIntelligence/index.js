/**
 * Universal Resource Intelligence — public facade for consumers.
 * Universal Library, Capability Engine, Performer, Business Creation, Creator Studio
 * should call into this module instead of duplicating provider search.
 *
 * Boundary: Consumer → URI public API → Federation → Provider adapter.
 * Consumers must not import provider adapters directly.
 */

export { buildCanonicalIntent } from './intentEngine.js';
export { planSearchFromIntent } from './queryPlanner.js';
export {
  registerSourceNode,
  listSourceNodes,
  getSourceNode,
  federationHealth,
  ensureFederationReady,
  getAdapter,
  listAdapters,
  setSourceStatus,
} from './sourceFederation.js';
export { planFederationSources } from './federationPlanner.js';
export {
  bootstrapProviderAdapters,
  registerProviderAdapter,
  validateAdapterContract,
  normalizeAdapterHit,
} from './providerSdk/index.js';
export { assembleResourceKit } from './kitAssembly.js';
export { runFederationOpsIntake } from './opsIntake.js';
export { discoverFromPlan } from './discoveryEngine.js';
export {
  upsertResourceRecord,
  getResourceRecord,
  listResourceIndex,
  resourceIndexStats,
} from './resourceIndex.js';
export { enrichWithAiMetadata } from './metadataIntelligence.js';
export {
  suggestRights,
  decideRights,
  evaluateResourceRights,
} from './rightsIntelligence.js';
export { buildReusePlan, confirmReusePlan } from './reusePlanner.js';
export { explainCandidate } from './candidateExplainer.js';
export {
  selectResourceCandidate,
  confirmAndExecuteReuse,
  cancelReuseDecision,
  getReuseUseRecord,
} from './reuseJourney.js';
export { runReuseOpsProofs } from './opsProofs.js';
export { buildMultimodalIntent } from './multimodalIntent.js';
export {
  openResourceWorkspace,
  resumeResourceWorkspace,
  listResourceWorkspaces,
  mutateWorkspaceShortlist,
  placeWorkspaceResources,
  workspaceSubstitutions,
  workspaceEvaluation,
} from './resourceWorkspace.js';
export { listDestinationAdapters, materializeDestination } from './destinationAdapters.js';
export { recommendCrossMediaCombination } from './crossMediaMatcher.js';
export { proposeSubstitutions } from './substitutionEngine.js';
export { summarizeEvaluation, recordEvaluationEvent } from './evaluationFramework.js';
export {
  proposeCollections,
  listCollectionCandidates,
  approveCollectionCandidate,
} from './collectionIntelligence.js';
export { askOperationsCopilot } from './operationsCopilot.js';
export {
  recordLearningEvent,
  listLearningEvents,
  learningSummary,
} from './learningEngine.js';
export {
  listAiProviders,
  invokeAiModality,
  registerAiProvider,
  bootstrapDefaultAiProviders,
} from './aiProviderRegistry.js';
export {
  runResourceIntelligenceSearch,
  runResourceIntelligencePlan,
  runResourceIntelligenceDiscover,
  runResourceIntelligenceReuse,
  explainResourceIntelligence,
} from './pipeline.js';
export { getJob, listJobs } from './jobStore.js';
export { searchResourcesForConsumer } from './consumers.js';
export {
  runBusinessTask,
  runCandidateAction,
  listBusinessTasks,
} from './businessTaskEngine.js';
export {
  saveResourceKit,
  getResourceKit,
  listResourceKits,
  duplicateResourceKit,
  shareResourceKit,
  publishResourceKit,
  reuseResourceKit,
} from './resourceKits.js';
export { buildResourceGraph } from './resourceGraph.js';
export { recommendResources } from './recommendations.js';
export {
  suggestCapabilitiesFromPatterns,
  approveCapabilitySuggestion,
} from './capabilityPatternSuggest.js';
export { buildContextActions, actionToDestination } from './contextActions.js';
export * from './types.js';

import { federationHealth } from './sourceFederation.js';
import { resourceIndexStats } from './resourceIndex.js';
import { listAiProviders } from './aiProviderRegistry.js';
import { learningSummary } from './learningEngine.js';
import { listDestinationAdapters } from './destinationAdapters.js';
import { listBusinessTasks } from './businessTaskEngine.js';
import {
  CUSTODY_MODE_PHASE2_ENABLED,
  CUSTODY_MODE_DISABLED,
} from './types.js';

export function uriHealth() {
  return {
    ok: true,
    service: 'universal_resource_intelligence',
    phase: '5_global_resource_federation',
    role: 'platform_infrastructure',
    primaryUi: 'business_tasks',
    adminUi: '/control-center/resource-intelligence/workspace',
    federation: federationHealth(),
    providerSdk: true,
    index: resourceIndexStats(),
    aiProviders: listAiProviders(),
    learning: learningSummary(),
    custody: {
      enabled: CUSTODY_MODE_PHASE2_ENABLED,
      disabled: CUSTODY_MODE_DISABLED,
    },
    destinations: listDestinationAdapters(),
    businessTasks: listBusinessTasks(),
    binariesStored: 0,
    autonomousCrawling: false,
    autonomousPublishing: false,
    autoSuitcase: false,
    nextPhase: '5.5_universal_resource_operating_system',
  };
}
