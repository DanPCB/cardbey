/**
 * Factory Runtime V1 — public API (sits under Performer Runtime).
 */

export { validateFactoryDefinition, resolveInputMapping, applyOutputMapping } from './factoryDefinition.js';
export {
  registerFactory,
  getFactory,
  listFactories,
  CREATIVE_ASSET_FACTORY_V1_ID,
  CREATIVE_ASSET_FACTORY_V2_ID,
  CREATIVE_ASSET_FACTORY_V3_ID,
  CAMPAIGN_PACKAGE_FACTORY_V1_ID,
} from './factoryRegistry.js';
export {
  registerFactoryStageHandler,
  getFactoryStageHandler,
  listFactoryStageHandlers,
} from './factoryStageHandlerRegistry.js';
export { registerFactoryIntent, resolveFactoryIntent, listFactoryIntents } from './factoryIntentRegistry.js';
export {
  mergeApprovedPlanIntoState,
  resolvePlanFromState,
  resolveApprovalPolicy,
} from './factoryApprovalPolicy.js';
export {
  finalizeFactoryArtifactFromPolicy,
  resolveArtifactPolicy,
  extractArtifactCandidate,
} from './factoryArtifactPolicy.js';
export { bootstrapFactoryRuntime } from './factoryBootstrap.js';
export { runFactoryExecution } from './factoryRuntimeExecutor.js';
export {
  loadPendingFactoryExecution,
  handleFactoryApprovalDecision,
  persistFactoryPending,
  createFactoryExecutionState,
} from './factoryApprovalService.js';
export {
  FACTORY_STATUS_AWAITING_APPROVAL,
  FACTORY_STATUS_COMPLETED,
  FACTORY_STATUS_FAILED,
  FACTORY_CONTEXT_KEY,
} from './factoryConstants.js';
export {
  emitFactoryExecutionStarted,
  emitFactoryStageStarted,
  emitFactoryStageCompleted,
  emitFactoryStageFailed,
  emitFactoryExecutionPaused,
  emitFactoryExecutionResumed,
  emitFactoryExecutionCompleted,
} from './factoryTelemetry.js';
export {
  isCreativeFactoryV1Enabled,
  isCreativeFactoryV2Enabled,
  isCreativeFactoryV3Enabled,
  resolveCreativeFactoryId,
  isCreativeFactoryIntent,
  tryRouteCreativeFactoryIntent,
  tryRouteFactoryIntent,
  loadFactoryExecutionFromMission,
} from './factoryIntentRouter.js';
