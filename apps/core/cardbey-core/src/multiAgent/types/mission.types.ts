/**
 * Mission pipeline type definitions.
 */

import type { Intent, MissionPlan, ReviewResult, TelemetryData } from './agent.types.js';

export interface MissionContext {
  userId?: string;
  tenantKey?: string;
  sessionId?: string;
  locale?: string;
  metadata?: Record<string, unknown>;
}

export interface MissionRequest {
  message: string;
  context?: MissionContext;
}

export interface PipelineStage {
  name: string;
  startedAt: Date;
  completedAt?: Date;
  success: boolean;
  error?: string;
}

export interface PipelineTrace {
  missionId: string;
  stages: PipelineStage[];
  telemetry: Partial<TelemetryData>;
}

export interface PlanExecutionContext {
  missionId: string;
  plan: MissionPlan;
  review?: ReviewResult;
  intent: Intent;
  parallelLimit: number;
  retryOnFailure: boolean;
}
