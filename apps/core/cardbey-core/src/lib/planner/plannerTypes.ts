/**
 * ============================================================
 * PHASE C — PLANNER TYPES
 * ============================================================
 *
 * Types for the Dynamic Planner system.
 */

import type { IntentType, SuggestedAction, WorkflowType } from '../intent/intentTypes.js';

/** A dynamically generated plan. */
export interface DynamicPlan {
  planId: string;
  intent: IntentType;
  workflow: WorkflowType;
  steps: PlanStep[];
  metadata: PlanMetadata;
  contextSnapshot: PlanContextSnapshot;
  reasoning: string[];
  suggestedActions: SuggestedAction[];
  generatedAt: string;
  version: string;
}

export type PlanStepType =
  | 'action'
  | 'checkpoint'
  | 'condition'
  | 'parallel'
  | 'wait'
  | 'notification';

export type PlanStepGuestBehavior = 'block' | 'warn' | 'allow' | 'guide_to_sign_in';

/** A single step in a dynamic plan. */
export interface PlanStep {
  id: string;
  name: string;
  label: string;
  type: PlanStepType;
  tool: string | null;
  order: number;
  optional: boolean;
  dependencies: string[];
  estimatedDuration: number;
  checkpointConfig?: CheckpointConfig;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  condition?: string;
  guestBehavior?: PlanStepGuestBehavior;
  labels?: Record<string, string>;
}

export type CheckpointType = 'confirmation' | 'input' | 'upload' | 'selection' | 'review';

/** Configuration for a checkpoint step. */
export interface CheckpointConfig {
  type: CheckpointType;
  prompt: string;
  required: boolean;
  options?: CheckpointOption[];
  validationSchema?: Record<string, unknown>;
  defaultValue?: unknown;
  timeoutSeconds?: number;
  labels?: Record<string, string>;
}

/** An option for a selection checkpoint. */
export interface CheckpointOption {
  id: string;
  label: string;
  description: string;
  icon?: string;
}

/** Plan metadata. */
export interface PlanMetadata {
  totalSteps: number;
  estimatedDuration: number;
  requiresSignIn: boolean;
  requiresStore: boolean;
  primaryTool?: string;
  tags: string[];
  priority: number;
}

/** Snapshot of user context at plan generation time. */
export interface PlanContextSnapshot {
  activeStoreId?: string | null;
  activeDraftId?: string | null;
  activeStoreName?: string | null;
  isGuest?: boolean;
  currentWorkflow?: string | null;
  userId?: string | null;
}

/** Plan generation result. */
export interface PlanGenerationResult {
  plan: DynamicPlan;
  success: boolean;
  error?: string;
  generationTimeMs: number;
  alternatives: SuggestedAction[];
}

/** Plan generator configuration. */
export interface PlannerConfig {
  maxSteps: number;
  guestAwareEnabled: boolean;
  conditionStepsEnabled: boolean;
  defaultStepDuration: number;
  version: string;
}

/** Raw template step shape (before normalization). */
export interface PlanTemplateStep {
  id: string;
  name: string;
  label: string;
  labelVI?: string;
  type: PlanStepType;
  tool?: string | null;
  optional?: boolean;
  dependencies?: string[];
  estimatedDuration?: number;
  guestBehavior?: PlanStepGuestBehavior;
  checkpointConfig?: CheckpointConfig & { promptVI?: string };
}

/** Plan template definition. */
export interface PlanTemplate {
  intent: IntentType;
  workflow: WorkflowType;
  steps: PlanTemplateStep[];
  metadata: PlanMetadata;
}
