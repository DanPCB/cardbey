/**
 * Synchronous multi-agent health signals derived from runtime config and telemetry.
 * Does not invoke LLM agents on each health poll (avoids cost/latency side effects).
 */

import { loadMultiAgentRuntimeConfig } from '../../config/agent.config.js';
import { loadDeepSeekConfig } from '../../config/deepseek.config.js';
import type { AgentMetrics } from '../types/metrics.types.js';

export const MONITORED_AGENTS = [
  'intent_classifier',
  'planner',
  'critic',
  'refiner',
  'specialist',
  'reasoning',
] as const;

export type MonitoredAgentName = (typeof MONITORED_AGENTS)[number];

export interface AgentHealthDetail {
  name: MonitoredAgentName;
  displayName: string;
  status: 'healthy' | 'degraded' | 'critical';
  latencyMs: number;
  calls: number;
  lastCheck: string;
  error?: string;
}

export interface ConfigHealthFlags {
  configValid: boolean;
  healthChecks: boolean;
  capacityAvailable: boolean;
}

const DISPLAY_NAMES: Record<MonitoredAgentName, string> = {
  intent_classifier: 'Intent Classifier',
  planner: 'Planner',
  critic: 'Critic',
  refiner: 'Refiner',
  specialist: 'Specialist',
  reasoning: 'Reasoning',
};

export function getMultiAgentConfigHealth(processRssMb = 0): ConfigHealthFlags {
  const runtime = loadMultiAgentRuntimeConfig();
  const deepseek = loadDeepSeekConfig();
  const monitoringEnabled = process.env.MONITORING_ENABLED !== 'false';

  const configValid =
    !runtime.enabled || Boolean(deepseek.apiKey?.trim()) || deepseek.shadowEnabled;
  const memoryCritical = Number.parseInt(process.env.ALERT_MEMORY_CRITICAL ?? '4000', 10) || 4000;
  const capacityAvailable = processRssMb <= 0 || processRssMb < memoryCritical;

  return {
    configValid,
    healthChecks: monitoringEnabled && runtime.telemetryEnabled,
    capacityAvailable,
  };
}

function mapAgentStatus(
  agentStatus: 'up' | 'down' | 'degraded' | undefined,
): AgentHealthDetail['status'] {
  if (agentStatus === 'down') return 'critical';
  if (agentStatus === 'degraded') return 'degraded';
  return 'healthy';
}

export function buildAgentHealthDetails(input: {
  agentPerformance: AgentMetrics[];
  agentStatuses: Record<string, 'up' | 'down' | 'degraded'>;
  checkedAt?: Date;
}): AgentHealthDetail[] {
  const checkedAt = (input.checkedAt ?? new Date()).toISOString();

  return MONITORED_AGENTS.map((name) => {
    const perf = input.agentPerformance.find((row) => row.agentName === name);
    const status = mapAgentStatus(input.agentStatuses[name]);
    const error = perf?.errors?.[perf.errors.length - 1];

    return {
      name,
      displayName: DISPLAY_NAMES[name],
      status,
      latencyMs: perf ? Math.round(perf.averageLatency) : 0,
      calls: perf?.calls ?? 0,
      lastCheck: checkedAt,
      ...(error ? { error } : {}),
    };
  });
}

export function countActiveAgents(details: AgentHealthDetail[]): number {
  return details.filter((agent) => agent.status !== 'critical').length;
}

export function countSleepingAgents(details: AgentHealthDetail[]): number {
  return details.filter((agent) => agent.calls === 0).length;
}

export function computeHealthScore(input: {
  successRate: number;
  configValid: boolean;
  isFresh: boolean;
  agentDetails: AgentHealthDetail[];
}): number {
  let score = 100;
  score -= (1 - input.successRate) * 30;
  if (!input.configValid) score -= 25;
  if (!input.isFresh) score -= 15;
  const degraded = input.agentDetails.filter((a) => a.status === 'degraded').length;
  const critical = input.agentDetails.filter((a) => a.status === 'critical').length;
  score -= degraded * 5;
  score -= critical * 15;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function resolveUpdateIntervalSeconds(): number {
  const raw = Number.parseInt(process.env.METRICS_FLUSH_INTERVAL ?? '180000', 10);
  const ms = Number.isFinite(raw) && raw > 0 ? raw : 180_000;
  return Math.round(ms / 1000);
}

export function resolveFreshnessThresholdMs(): number {
  const raw = Number.parseInt(process.env.MONITORING_FRESHNESS_MS ?? '300000', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 300_000;
}
