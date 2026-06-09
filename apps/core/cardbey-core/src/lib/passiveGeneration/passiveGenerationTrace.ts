/**
 * Passive generation pipeline trace — observability for each canonical stage.
 * Used by Performer UI to show acquisition progress and confidence.
 */

export type PipelineStage =
  | 'intent_input'
  | 'intent_structuring'
  | 'gap_detection'
  | 'data_acquisition'
  | 'data_fusion'
  | 'confidence_scoring'
  | 'artifact_planning'
  | 'artifact_generation'
  | 'exposure_planning'
  | 'continuous_enrichment'
  | 'confirmation_gate';

export interface TraceEvent {
  stage: PipelineStage;
  at: string;
  message: string;
  /** Optional structured payload for UI (counts, field names, etc.). */
  detail?: Record<string, unknown>;
}

export interface PassiveGenerationTrace {
  traceId: string;
  startedAt: string;
  updatedAt: string;
  events: TraceEvent[];
}

export function createTrace(traceId: string): PassiveGenerationTrace {
  const now = new Date().toISOString();
  return { traceId, startedAt: now, updatedAt: now, events: [] };
}

export function appendTrace(
  trace: PassiveGenerationTrace,
  stage: PipelineStage,
  message: string,
  detail?: Record<string, unknown>,
): PassiveGenerationTrace {
  const at = new Date().toISOString();
  return {
    ...trace,
    updatedAt: at,
    events: [...trace.events, { stage, at, message, detail }],
  };
}

/** Compact summary for Performer / API responses. */
export function summarizeTrace(trace: PassiveGenerationTrace): {
  traceId: string;
  stageCount: number;
  lastStage: PipelineStage | null;
  stages: PipelineStage[];
  messages: string[];
} {
  const stages = trace.events.map((e) => e.stage);
  return {
    traceId: trace.traceId,
    stageCount: trace.events.length,
    lastStage: stages.length ? stages[stages.length - 1] : null,
    stages: [...new Set(stages)],
    messages: trace.events.map((e) => e.message),
  };
}
