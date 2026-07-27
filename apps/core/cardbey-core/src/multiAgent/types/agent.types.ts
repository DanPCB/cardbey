/**
 * Agent type definitions for Cardbey Performer multi-agent pipeline.
 */

export enum AgentType {
  INTENT_CLASSIFIER = 'intent_classifier',
  PLANNER = 'planner',
  CRITIC = 'critic',
  REFINER = 'refiner',
  SPECIALIST = 'specialist',
  REASONING = 'reasoning',
}

export enum Intent {
  STORE_SETUP = 'STORE_SETUP',
  STORE_UPDATE = 'STORE_UPDATE',
  STORE_QUERY = 'STORE_QUERY',
  MISSION_PLANNING = 'MISSION_PLANNING',
  GENERAL_QUERY = 'GENERAL_QUERY',
  SUPPORT = 'SUPPORT',
}

export enum ReasoningEffort {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

export type ThinkingMode = 'enabled' | 'disabled';

export interface ThinkingConfig {
  type: ThinkingMode;
  reasoningEffort: ReasoningEffort;
}

export interface AgentConfig {
  model: string;
  provider: string;
  thinking?: ThinkingConfig;
  maxTokens?: number;
  temperature?: number;
}

export type MultiStoreExtractedSummary = {
  count: number;
  locations: string[];
  names: string[];
  categories: string[];
  missingFields: string[];
  isMultiStore: boolean;
  vagueLocation: boolean;
};

export interface IntentResult {
  intent: Intent;
  confidence: number;
  entities?: Record<string, unknown>;
  needsClarification?: boolean;
  missingFields?: string[];
  multiStore?: MultiStoreExtractedSummary;
}

export interface PlanStep {
  id: string;
  action: string;
  parameters: Record<string, unknown>;
  dependencies?: string[];
  validation?: string;
}

export interface MissionPlan {
  steps: PlanStep[];
  requiredTools: string[];
  estimatedComplexity: 'low' | 'medium' | 'high';
  dependencies: Record<string, string[]>;
  estimatedDuration?: number;
  isClarification?: boolean;
  missingFields?: string[];
  clarificationMessage?: string;
  multiStore?: MultiStoreExtractedSummary;
}

export interface ReviewResult {
  approved: boolean;
  issues: string[];
  suggestions: string[];
  confidence: number;
  risks?: string[];
}

export interface ExecutionResult {
  success: boolean;
  stepId: string;
  result: unknown;
  error?: string;
  duration: number;
}

export type MissionStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'pending_human_review';

export interface TokenUsageByAgent {
  [key: string]: number;
}

export interface TelemetryData {
  missionId: string;
  timestamp: Date;
  duration: number;
  agentsUsed: AgentType[];
  tokenUsage: {
    total: number;
    byAgent: Partial<Record<AgentType, number>>;
  };
  thinkingMode: ThinkingConfig;
  parallelLimit: number;
  hitlEnabled: boolean;
  retries: number;
  errors: string[];
  costUsd?: number;
  qualityMetrics?: QualityMetrics;
  shadowComparison?: ShadowComparison;
  /** Enriched fields for monitoring dashboard */
  intent?: Intent | string;
  missionStatus?: MissionStatus;
  userMessage?: string;
  planSteps?: number;
  planComplexity?: 'low' | 'medium' | 'high';
}

export interface QualityMetrics {
  intentConfidence?: number;
  planApprovalRate?: number;
  criticConfidence?: number;
  refinementCount?: number;
}

export interface ShadowComparison {
  primaryProvider: string;
  shadowProvider: string;
  intentMatch: boolean;
  shadowIntent?: string;
  shadowConfidence?: number;
  deepSeekBetter?: boolean;
  planStepDelta?: number;
  notes?: string[];
}

export interface MissionResult {
  missionId: string;
  status: MissionStatus;
  intent: Intent;
  plan?: MissionPlan;
  review?: ReviewResult;
  execution?: ExecutionResult[];
  finalResponse: string;
  telemetry: TelemetryData;
  error?: string;
  hitlFeedback?: HitlFeedback;
}

export interface HitlFeedback {
  reviewerId?: string;
  decision: 'approved' | 'rejected' | 'modified';
  notes?: string;
  timestamp: Date;
}

export interface AgentCallResult<T = unknown> {
  data: T;
  tokensUsed: number;
  durationMs: number;
  model: string;
  provider: string;
}

export type SpecialistDomain =
  | 'store_setup'
  | 'store_management'
  | 'general_assistance'
  | 'customer_support';
