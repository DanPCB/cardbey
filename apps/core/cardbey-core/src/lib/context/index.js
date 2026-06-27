export * from './contextTypes.ts';
export { ContextQueries } from './contextQueries.js';
export {
  isContextEngineEnabled,
  getContextStore,
  getContextProvider,
  getContextExtractor,
  resetContextEngineForTests,
  ContextStore,
  ContextProvider,
  ContextExtractor,
  contextExtractor,
} from './contextEngine.js';
export {
  bootstrapIntakeContext,
  backfillStoreIdFromMission,
  finalizeIntakeContext,
  mergePersistedWithClientContext,
  resolveContextSessionId,
  resolveContextUserId,
  toClassifierHints,
} from './contextIntakeBridge.js';
export {
  onMissionStarted,
  onMissionCheckpoint,
  onMissionCheckpointResolved,
  onMissionCompleted,
} from './contextMissionHooks.js';
