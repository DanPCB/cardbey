/**
 * Passive Intent-to-Artifact pipeline — public exports.
 */

export { runPassiveGenerationPipeline } from './passiveGenerationPipeline.js';
export type {
  PassiveGenerationInput,
  PassiveGenerationResult,
} from './passiveGenerationPipeline.js';

export { structureIntent, detectMissingData } from './intentGapAnalyzer.js';
export type {
  IntentInput,
  StructuredIntent,
  DataGap,
  IntentType,
  DesiredOutcome,
  AcquisitionTaskType,
} from './intentGapAnalyzer.js';

export { runAcquisitionPlan, MAX_TASKS_PER_RUN } from './acquisitionCoordinator.js';
export { mergeAcquiredData } from './externalDataFusion.js';
export type { BusinessEntity, AcquisitionPayload } from './externalDataFusion.js';

export {
  mergeFieldConfidence,
  flagLowConfidenceFields,
  overallEntityConfidence,
} from './confidenceResolver.js';

export { planArtifacts, planContinuousEnrichment } from './artifactExposurePlanner.js';
export type { PlannedArtifact, ExposurePlan, ArtifactPlanResult } from './artifactExposurePlanner.js';

export {
  listSources,
  getSourcesForCapability,
  BUILTIN_SOURCES,
} from './acquisitionSourceRegistry.js';
export type { AcquisitionSource } from './acquisitionSourceRegistry.js';

export { createTrace, appendTrace, summarizeTrace } from './passiveGenerationTrace.js';
export type { PipelineStage, PassiveGenerationTrace } from './passiveGenerationTrace.js';
