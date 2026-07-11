/**
 * Per-agent configuration and multi-agent runtime settings.
 */

import type { AgentConfig, AgentType } from '../types/agent.types.js';
import { ReasoningEffort } from '../types/agent.types.js';
import { loadDeepSeekConfig } from './deepseek.config.js';

function parseBool(value: string | undefined, fallback = false): boolean {
  if (value == null || value.trim() === '') return fallback;
  return value.trim().toLowerCase() === 'true' || value === '1';
}

function parseIntEnv(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const AGENT_ENV_KEYS: Record<
  AgentType,
  { model: string; provider: string; defaultEffort: ReasoningEffort }
> = {
  intent_classifier: {
    model: 'AGENT_INTENT_CLASSIFIER_MODEL',
    provider: 'AGENT_INTENT_CLASSIFIER_PROVIDER',
    defaultEffort: ReasoningEffort.MEDIUM,
  },
  planner: {
    model: 'AGENT_PLANNER_MODEL',
    provider: 'AGENT_PLANNER_PROVIDER',
    defaultEffort: ReasoningEffort.HIGH,
  },
  critic: {
    model: 'AGENT_CRITIC_MODEL',
    provider: 'AGENT_CRITIC_PROVIDER',
    defaultEffort: ReasoningEffort.HIGH,
  },
  refiner: {
    model: 'AGENT_REFINER_MODEL',
    provider: 'AGENT_REFINER_PROVIDER',
    defaultEffort: ReasoningEffort.MEDIUM,
  },
  specialist: {
    model: 'AGENT_SPECIALIST_MODEL',
    provider: 'AGENT_SPECIALIST_PROVIDER',
    defaultEffort: ReasoningEffort.MEDIUM,
  },
  reasoning: {
    model: 'AGENT_REASONING_MODEL',
    provider: 'AGENT_REASONING_PROVIDER',
    defaultEffort: ReasoningEffort.HIGH,
  },
};

export interface MultiAgentRuntimeConfig {
  enabled: boolean;
  parallelLimit: number;
  retryOnFailure: boolean;
  maxRefinements: number;
  executePlans: boolean;
  hitlEnabled: boolean;
  traceEnabled: boolean;
  telemetryEnabled: boolean;
  logLevel: string;
  shadowLogDetailed: boolean;
}

export function loadMultiAgentRuntimeConfig(): MultiAgentRuntimeConfig {
  return {
    enabled: parseBool(process.env.MULTI_AGENT_ENABLED, true),
    parallelLimit: parseIntEnv(process.env.MULTI_AGENT_PARALLEL_LIMIT, 5),
    retryOnFailure: parseBool(process.env.MULTI_AGENT_RETRY_ON_FAILURE, true),
    maxRefinements: parseIntEnv(process.env.MULTI_AGENT_MAX_REFINEMENTS, 3),
    executePlans: parseBool(process.env.MULTI_AGENT_EXECUTE, false),
    hitlEnabled: parseBool(process.env.HITL_REVIEW_ENABLED, true),
    traceEnabled: parseBool(process.env.AGENT_TRACE_ENABLED, true),
    telemetryEnabled: parseBool(process.env.AGENT_TELEMETRY_ENABLED, true),
    logLevel: process.env.AGENT_LOG_LEVEL?.trim() || 'info',
    shadowLogDetailed: parseBool(process.env.AGENT_SHADOW_LOG_DETAILED, true),
  };
}

export function loadAgentConfig(
  agentType: AgentType,
  overrides?: Partial<AgentConfig>,
): AgentConfig {
  const deepseek = loadDeepSeekConfig();
  const keys = AGENT_ENV_KEYS[agentType];
  const model =
    overrides?.model ||
    process.env[keys.model]?.trim() ||
    deepseek.model;
  const provider =
    overrides?.provider ||
    process.env[keys.provider]?.trim() ||
    'deepseek';

  return {
    model,
    provider,
    thinking: overrides?.thinking || {
      type: deepseek.thinking.type,
      reasoningEffort: keys.defaultEffort,
    },
    maxTokens: overrides?.maxTokens ?? deepseek.maxTokens,
    temperature: overrides?.temperature ?? 0.7,
  };
}

export function shouldRouteToDeepSeek(missionId: string): boolean {
  const { enabled, abTrafficPercent } = loadDeepSeekConfig();
  if (!enabled) return false;
  if (abTrafficPercent >= 100) return true;
  if (abTrafficPercent <= 0) return false;

  // Deterministic bucket from mission id for stable A/B assignment.
  let hash = 0;
  for (let i = 0; i < missionId.length; i += 1) {
    hash = (hash * 31 + missionId.charCodeAt(i)) % 100;
  }
  return hash < abTrafficPercent;
}
