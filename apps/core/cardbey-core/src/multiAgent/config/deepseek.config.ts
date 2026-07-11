/**
 * DeepSeek API configuration loaded from environment variables.
 */

import type { ThinkingConfig } from '../types/agent.types.js';
import { ReasoningEffort } from '../types/agent.types.js';

function parseBool(value: string | undefined, fallback = false): boolean {
  if (value == null || value.trim() === '') return fallback;
  return value.trim().toLowerCase() === 'true' || value === '1';
}

function parseIntEnv(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export interface DeepSeekConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  enabled: boolean;
  thinking: ThinkingConfig;
  maxTokens: number;
  timeoutMs: number;
  retryAttempts: number;
  shadowEnabled: boolean;
  abTrafficPercent: number;
}

export function loadDeepSeekConfig(): DeepSeekConfig {
  const thinkingMode = (process.env.DEEPSEEK_THINKING_MODE?.trim() || 'enabled') as
    | 'enabled'
    | 'disabled';

  const effortRaw = process.env.DEEPSEEK_REASONING_EFFORT?.trim().toLowerCase() || 'medium';
  const reasoningEffort =
    effortRaw === 'low'
      ? ReasoningEffort.LOW
      : effortRaw === 'high'
        ? ReasoningEffort.HIGH
        : ReasoningEffort.MEDIUM;

  return {
    apiKey: process.env.DEEPSEEK_API_KEY?.trim() || '',
    baseUrl: process.env.DEEPSEEK_BASE_URL?.trim() || 'https://api.deepseek.com',
    model: process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-v4-flash',
    enabled: parseBool(process.env.DEEPSEEK_ENABLED, true),
    thinking: {
      type: thinkingMode,
      reasoningEffort,
    },
    maxTokens: parseIntEnv(process.env.DEEPSEEK_MAX_TOKENS, 4096),
    timeoutMs: parseIntEnv(process.env.DEEPSEEK_TIMEOUT, 60_000),
    retryAttempts: parseIntEnv(process.env.DEEPSEEK_RETRY_ATTEMPTS, 3),
    shadowEnabled: parseBool(process.env.MULTI_AGENT_SHADOW, false),
    abTrafficPercent: parseIntEnv(process.env.DEEPSEEK_AB_TRAFFIC_PERCENT, 100),
  };
}

export interface FallbackConfig {
  openaiApiKey: string;
  anthropicApiKey: string;
  xaiApiKey: string;
  openaiModel: string;
  anthropicModel: string;
  xaiModel: string;
}

export function loadFallbackConfig(): FallbackConfig {
  return {
    openaiApiKey: process.env.OPENAI_API_KEY?.trim() || '',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY?.trim() || '',
    xaiApiKey: process.env.XAI_API_KEY?.trim() || '',
    openaiModel: process.env.OPENAI_BACKUP_MODEL?.trim() || 'gpt-4o-mini',
    anthropicModel: process.env.ANTHROPIC_BACKUP_MODEL?.trim() || 'claude-sonnet-4-2',
    xaiModel: process.env.XAI_BACKUP_MODEL?.trim() || 'grok-3-beta',
  };
}

/** Approximate USD cost per 1M tokens (input+output blended) for cost tracking. */
export const MODEL_COST_PER_MILLION: Record<string, number> = {
  'deepseek-v4-flash': 0.14,
  'gpt-4o-mini': 0.3,
  'claude-sonnet-4-2': 3.0,
  'grok-3-beta': 2.0,
};

export function estimateCostUsd(model: string, tokens: number): number {
  const rate = MODEL_COST_PER_MILLION[model] ?? 0.5;
  return (tokens / 1_000_000) * rate;
}
