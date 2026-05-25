/**
 * Performer Runtime — Phase 1.5 public API.
 */

export {
  isPerformerRuntimeEnabled,
  isPerformerRuntimePipelineFacadeEnabled,
  isPerformerRuntimeUnifiedStreamEnabled,
  isPerformerRuntimeOwnershipWarnEnabled,
  isPerformerRuntimeOwnershipBlockEnabled,
  isPerformerRuntimeStatePersistEnabled,
} from './runtimeFlags.js';

export {
  createPerformerRuntimeContext,
  patchRuntimeContext,
  runtimeContextFromRequest,
  runtimeContextSnapshot,
} from './runtimeContext.js';

export {
  registerRuntimeContext,
  getRuntimeById,
  getRuntimeByMissionId,
  resolveRuntimeContext,
  updateRuntimeState,
  resetRuntimeStateStore,
} from './runtimeState.js';

export {
  categorizeStreamEvent,
  normalizeStreamEvent,
  emitRuntimeStreamEvent,
  getUnifiedRuntimeStream,
} from './unifiedRuntimeStream.js';

export {
  recordRuntimeViolation,
  assertRuntimeOwnership,
  markRuntimeOwnedContext,
} from './runtimeOwnership.js';

export {
  addRuntimeGraphNode,
  addRuntimeGraphEdge,
  recordRuntimeExecutionNode,
} from './runtimeStateGraph.js';

export { executeRuntimeAction } from './executeRuntimeAction.js';
export { dryRunExecutionPlan, validateDryRunIntent, resolveCapabilityAvailability } from './dryRunExecutionPlan.js';
export { performerRuntime, execute as performerRuntimeExecute } from './performerRuntime.js';
