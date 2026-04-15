/**
 * Shared types for the Cardbey Performer ReAct layer (Reason → Act → Observe → Reflect).
 * Types only — no runtime logic.
 */

export type ReActAction = 'proceed' | 'retry' | 'skip' | 'replan';

export type StepPriority = 'required' | 'optional';

export type PlannedStep = {
  tool: string;
  label: string;
  priority: StepPriority;
  skipIf?: string;
  retryOn?: string;
  contextHint?: string;
};

/** Runtime-only fields used by the executor (not part of persisted plans). */
export type RuntimePlannedStep = PlannedStep & {
  _retryCount?: number;
};

export type MissionPlan = {
  missionId: string;
  reasoning: string;
  steps: PlannedStep[];
  estimatedSteps: number;
  createdAt: number;
};

export type StepObservation = {
  stepIndex: number;
  tool: string;
  success: boolean;
  outputKeys: string[];
  emptyKeys: string[];
  durationMs: number;
  error?: string;
};

export type StepReflection = {
  observation: StepObservation;
  action: ReActAction;
  reasoning: string;
  hint?: string;
  skipTarget?: string;
};

export type ValidationIssue = {
  slot: string;
  issue: string;
  autoFixable: boolean;
  fixHint: string;
};

export type ValidationResult = {
  valid: boolean;
  issues: ValidationIssue[];
  reasoning: string;
  autoFixed: string[];
};

export type ReActTrace = {
  plan: MissionPlan;
  observations: StepObservation[];
  reflections: StepReflection[];
  validation: ValidationResult | null;
  reasoningLog: string[];
};

export type LLMGatewayLike = {
  generate: (opts: {
    purpose: string;
    prompt: string;
    model?: string;
    provider?: string;
    maxTokens?: number;
    tenantKey: string;
    responseFormat?: 'text' | 'json';
    temperature?: number;
  }) => Promise<{ text: string; inputTokens: number; outputTokens: number; cached: boolean }>;
};

export type StepReporterLike = {
  emit: (message: string) => void | Promise<void>;
};

export type MissionReactBlackboardLike = {
  snapshot: () => Record<string, unknown>;
  write: (key: string, value: unknown) => void;
  appendReasoningLog: (line: string) => void;
  /** Optional: await queued reasoning_line DB/event writes (MissionReactBlackboard). */
  flushReasoningEmits?: () => Promise<void>;
};
