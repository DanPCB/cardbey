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
  ensureRuntimeAuthorizedContext,
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

export {
  assertRuntimeAuthorityContext,
  hasRuntimeAuthorityContext,
  recordRuntimeAuthorityPathUsed,
  recordRuntimeAuthorityBypass,
} from './runtimeAuthorityGuard.js';

export { routeOrchestraStartViaPerformerRuntime } from './orchestraRuntimeAdapter.js';

export {
  hasUiRuntimeAuthorityContext,
  assertUiWriteAuthority,
  markUiRuntimeInternalBypass,
  isStorageOnlyUploadPath,
  isStateChangingUploadPath,
  UI_RUNTIME_AUTHORITY_HEADER,
} from './uiWriteAuthorityGuard.js';

export { executeUiRuntimeAction } from './uiRuntimeActionService.js';

export {
  runFactoryExecution,
  getFactory,
  listFactories,
  handleFactoryApprovalDecision,
  FACTORY_STATUS_AWAITING_APPROVAL,
} from '../../factoryRuntime/index.js';
