/**
 * Skill Runtime — shared types (Phase 1).
 *
 * These primitives back an intent-based dispatch model that replaces brittle
 * keyword matching (e.g. "campaign" → generic pipeline). Nothing here touches
 * the existing skill dispatch; it is consumed only by the new
 * `lib/skill_runtime/` modules and their tests.
 */

/**
 * Everything a skill needs to know about the request that triggered it.
 * `metadata` is an open bag for surface-specific signals (feed, discover, etc.).
 */
export interface SkillContext {
  query: string;
  userId: string;
  conversationId: string;
  userHasProducts: boolean;
  existingSegments?: string[];
  historicalIntent?: string[];
  metadata: Record<string, any>;
}

/**
 * A single unit of work inside a skill. `execute` returns an arbitrary result
 * that is stored in the skill's step-results map. `rollback` (optional) undoes
 * the side effects of a previously-completed step.
 */
export interface Step {
  id: string;
  name: string;
  execute: (context: SkillContext, state: SkillState) => Promise<any>;
  rollback?: (context: SkillContext, state: SkillState) => Promise<void>;
}

/**
 * Lifecycle states for a skill run. Transitions are governed by a state
 * machine (see `TRANSITIONS` in `skill.ts`); arbitrary jumps are rejected.
 */
export type SkillState =
  | 'idle'
  | 'running'
  | 'paused'
  | 'failed'
  | 'completed'
  | 'cancelled';

/**
 * A trace entry. Two shapes share one type so `getTrace()` returns a single
 * chronological list of both step events and state transitions.
 */
export type TraceStatus =
  | 'started'
  | 'completed'
  | 'failed'
  | 'rolled_back'
  | 'rollback_failed';

export interface ExecutionTrace {
  type: 'step' | 'transition';
  timestamp: Date;
  /** Present when `type === 'step'`. */
  stepId?: string;
  stepName?: string;
  status?: TraceStatus;
  durationMs?: number;
  error?: string;
  /** Present when `type === 'transition'`. */
  fromState?: SkillState;
  toState?: SkillState;
}

/**
 * A point-in-time snapshot of a skill run. Designed to be persisted (see
 * `CheckpointStore`) so a skill can be paused on one HTTP request and resumed
 * on another. `intent` is carried so a runtime can be fully reconstructed.
 */
export interface Checkpoint {
  skillId: string;
  intent: string;
  state: SkillState;
  completedSteps: string[];
  currentStepIndex: number;
  context: SkillContext;
  stepResults: Map<string, any>;
  timestamp: Date;
}

/**
 * Wire/JSONB-friendly form of a checkpoint. `stepResults` becomes a plain
 * object and `timestamp` an ISO string so it round-trips through JSONB.
 */
export interface SerializedCheckpoint {
  skillId: string;
  intent: string;
  state: SkillState;
  completedSteps: string[];
  currentStepIndex: number;
  context: SkillContext;
  stepResults: Record<string, any>;
  timestamp: string;
}

/**
 * An intent matcher. `matches` returns a confidence score in [0, 1]; the
 * disambiguator keeps the highest scorer that clears `requiredConfidence`,
 * breaking ties by `priority` (higher wins).
 */
export interface IntentPattern {
  intent: string;
  /** 1-10, higher wins on confidence ties. */
  priority: number;
  matches: (context: SkillContext) => Promise<number>;
  /** Minimum confidence to be eligible. Defaults to 0.7 when omitted. */
  requiredConfidence?: number;
}

/** Default confidence threshold applied when a pattern omits one. */
export const DEFAULT_REQUIRED_CONFIDENCE = 0.7;
