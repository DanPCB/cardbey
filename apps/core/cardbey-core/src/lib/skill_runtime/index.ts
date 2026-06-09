/**
 * Skill Runtime — Phase 1 public surface.
 *
 * Intent-based dispatch primitives. Importing from here does NOT alter the
 * existing keyword-based dispatch; integration happens later (see
 * `./examples/dispatcherIntegration.ts`).
 */

export { SkillRuntime } from './skill.js';
export type { SkillRuntimeOptions } from './skill.js';

export { IntentDisambiguator } from './intent_disambiguator.js';
export type { ResolvedIntent, IntentScore } from './intent_disambiguator.js';

export { SkillRegistry } from './registry.js';
export type { RegisteredSkill } from './registry.js';

export {
  InMemoryCheckpointStore,
  PostgresCheckpointStore,
  serializeCheckpoint,
  deserializeCheckpoint,
} from './checkpoint_store.js';
export type {
  CheckpointStore,
  PgQueryable,
  PostgresCheckpointStoreOptions,
} from './checkpoint_store.js';

export {
  CARDBEY_INTENT_PATTERNS,
  LOYALTY_INTENT,
  PROMOTION_INTENT,
  setupLoyaltyProgramPattern,
  createPromotionPattern,
  // DANH: skill-runtime-phase2
  CATALOG_MANAGEMENT_INTENT,
  MENU_SYNC_INTENT,
  BOOKING_MANAGEMENT_INTENT,
  STORE_HEALTH_INTENT,
  catalogManagementPattern,
  menuSyncPattern,
  bookingManagementPattern,
  storeHealthPattern,
} from './patterns.js';

// DANH: skill-runtime-phase2 — singleton registry + dispatcher glue.
export { runtimeRegistry } from './runtimeRegistry.js';
export { dispatchWithRuntime } from './dispatchWithRuntime.js';
export type { RuntimeDispatchResult } from './dispatchWithRuntime.js';
export { buildSkillContext } from './skillContextBuilder.js';
export type { IntakePayload, PrismaLike } from './skillContextBuilder.js';

export type {
  SkillContext,
  Step,
  SkillState,
  Checkpoint,
  SerializedCheckpoint,
  ExecutionTrace,
  TraceStatus,
  IntentPattern,
} from './types.js';
export { DEFAULT_REQUIRED_CONFIDENCE } from './types.js';
