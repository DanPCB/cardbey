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
  isPerformerExecutionRecordsPersistEnabled,
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

export {
  EXECUTION_RECORDS_CONTEXT_KEY,
  MAX_MISSION_EXECUTION_RECORDS,
  normalizeExecutionRecord,
  parseExecutionRecordsFromMissionContext,
  upsertExecutionRecordInList,
  persistMissionExecutionRecord,
  listMissionExecutionRecords,
  buildExecutionRecordFromRuntime,
} from './executionRecords.js';

export {
  SKILL_CONTRACT_VERSION,
  SKILL_CONTRACTS,
  getSkillContract,
  resolveSkillContractForActionType,
  validatePlanAgainstSkillContract,
} from './skillContracts.js';

export {
  getRuntimeAuthorityRolloutStage,
  getRuntimeAuthoritySnapshot,
  getRuntimeAuthorityMetrics,
  recordRuntimeBypass,
  detectExecutionDuplication,
  isPerformerRuntimeDuplicationDetectEnabled,
} from './runtimeAuthorityStaging.js';
