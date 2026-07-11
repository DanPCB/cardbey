/**
 * Aggregates in-process multi-agent telemetry into Control Center dashboard data.
 */

import { EventEmitter } from 'node:events';
import type { TelemetryData } from '../../types/agent.types.js';
import { getMissionHistory, onMissionRecorded } from '../../telemetry/metrics.js';
import type {
  AgentMetrics,
  DashboardData,
  DashboardSummaryMetrics,
  MissionMetrics,
  ShadowComparison,
  SystemHealth,
} from '../types/metrics.types.js';
import { getAlerts } from '../alerts/alert.history.js';
import {
  buildAgentHealthDetails,
  computeHealthScore,
  countActiveAgents,
  countSleepingAgents,
  getMultiAgentConfigHealth,
  resolveFreshnessThresholdMs,
  resolveUpdateIntervalSeconds,
} from './agentHealth.js';

const RANGE_MS: Record<string, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

function parseTimeRange(timeRange: string): { start: Date; end: Date } {
  const end = new Date();
  const ms = RANGE_MS[timeRange] ?? RANGE_MS['24h'];
  return { start: new Date(end.getTime() - ms), end };
}

function inRange(ts: Date, range: { start: Date; end: Date }): boolean {
  const t = ts instanceof Date ? ts.getTime() : new Date(ts).getTime();
  return t >= range.start.getTime() && t <= range.end.getTime();
}

function mapMissionStatus(
  row: TelemetryData,
): MissionMetrics['status'] {
  if (row.missionStatus === 'pending_human_review') return 'pending_human_review';
  if (row.errors.length > 0 || row.missionStatus === 'failed') return 'failed';
  return 'success';
}

function toMissionMetrics(row: TelemetryData): MissionMetrics {
  const status = mapMissionStatus(row);
  return {
    missionId: row.missionId,
    intent: row.intent ?? 'UNKNOWN',
    status,
    duration: row.duration,
    agentsUsed: row.agentsUsed.map(String),
    tokenUsage: row.tokenUsage?.total ?? 0,
    cost: row.costUsd ?? 0,
    confidence: row.qualityMetrics?.intentConfidence ?? 0,
    planComplexity: row.planComplexity ?? 'medium',
  };
}

function toShadowComparison(row: TelemetryData): ShadowComparison | null {
  const sc = row.shadowComparison;
  if (!sc) return null;
  return {
    missionId: row.missionId,
    userMessage: row.userMessage ?? '',
    currentIntent: row.intent ?? 'UNKNOWN',
    deepSeekIntent: sc.shadowIntent ?? row.intent ?? 'UNKNOWN',
    currentConfidence: row.qualityMetrics?.intentConfidence ?? 0,
    deepSeekConfidence: sc.shadowConfidence ?? 0,
    matched: sc.intentMatch,
    deepSeekBetter: sc.deepSeekBetter ?? false,
    deepSeekPlanSteps: sc.planStepDelta != null ? Math.max(0, (row.planSteps ?? 0) + sc.planStepDelta) : row.planSteps ?? 0,
    currentPlanSteps: row.planSteps ?? 0,
  };
}

export class MultiAgentMetricsStore extends EventEmitter {
  private processMetrics = {
    rssMb: 0,
    heapUsedMb: 0,
    updatedAt: new Date(),
  };

  private lastMetricsUpdate = Date.now();

  constructor() {
    super();
    onMissionRecorded(() => {
      this.touchMetricsUpdate();
    });
  }

  private touchMetricsUpdate(): void {
    this.lastMetricsUpdate = Date.now();
    this.emit('metrics:updated', { timestamp: this.lastMetricsUpdate });
  }

  updateProcessMetrics(stats: { rssMb: number; heapUsedMb?: number }): void {
    this.processMetrics = {
      rssMb: stats.rssMb,
      heapUsedMb: stats.heapUsedMb ?? this.processMetrics.heapUsedMb,
      updatedAt: new Date(),
    };
    this.touchMetricsUpdate();
    this.emit('process:metrics', this.processMetrics);
  }

  getMissionMetrics(missionId: string): MissionMetrics | null {
    const id = String(missionId ?? '').trim();
    if (!id) return null;
    const row = getMissionHistory().find((m) => m.missionId === id);
    return row ? toMissionMetrics(row) : null;
  }

  getPrometheusMetrics(): string {
    const health = this.getSystemHealth();
    const recent = getMissionHistory().slice(-100).map(toMissionMetrics);
    const summary = this.calculateSummary(recent);
    const lines = [
      '# HELP cardbey_multi_agent_success_rate Mission success rate (recent window)',
      '# TYPE cardbey_multi_agent_success_rate gauge',
      `cardbey_multi_agent_success_rate ${summary.successRate}`,
      '# HELP cardbey_multi_agent_error_rate Mission error rate (recent window)',
      '# TYPE cardbey_multi_agent_error_rate gauge',
      `cardbey_multi_agent_error_rate ${summary.errorRate}`,
      '# HELP cardbey_multi_agent_avg_response_time_ms Average mission duration ms',
      '# TYPE cardbey_multi_agent_avg_response_time_ms gauge',
      `cardbey_multi_agent_avg_response_time_ms ${summary.averageResponseTime}`,
      '# HELP cardbey_multi_agent_total_cost_usd Total mission cost USD (recent window)',
      '# TYPE cardbey_multi_agent_total_cost_usd gauge',
      `cardbey_multi_agent_total_cost_usd ${summary.totalCost}`,
      '# HELP cardbey_process_rss_mb Process RSS megabytes',
      '# TYPE cardbey_process_rss_mb gauge',
      `cardbey_process_rss_mb ${this.processMetrics.rssMb}`,
      '# HELP cardbey_multi_agent_health_status 0=healthy 1=degraded 2=critical',
      '# TYPE cardbey_multi_agent_health_status gauge',
      `cardbey_multi_agent_health_status ${health.status === 'critical' ? 2 : health.status === 'degraded' ? 1 : 0}`,
    ];
    return `${lines.join('\n')}\n`;
  }

  getMissionsInRange(timeRange: string): TelemetryData[] {
    const range = parseTimeRange(timeRange);
    return getMissionHistory().filter((m) => inRange(m.timestamp, range));
  }

  getDashboardData(timeRange = '24h'): DashboardData {
    const missions = this.getMissionsInRange(timeRange);
    const missionRows = missions.map(toMissionMetrics);
    const comparisons = missions
      .map(toShadowComparison)
      .filter((c): c is ShadowComparison => c != null);

    return {
      timeRange,
      metrics: this.calculateSummary(missionRows),
      charts: {
        requestsOverTime: this.calculateRequestsOverTime(missions),
        intentDistribution: this.calculateIntentDistribution(missionRows),
        agentPerformance: this.calculateAgentPerformance(missions),
        costOverTime: this.calculateCostOverTime(missions),
        shadowComparison: this.calculateShadowStats(comparisons),
        health: this.getSystemHealth(),
      },
      recentMissions: missionRows.slice(-20).reverse(),
      recentAlerts: getAlerts({ limit: 20 }),
    };
  }

  getEvaluationSnapshot(windowSeconds: number): Record<string, unknown> {
    const timeRange =
      windowSeconds <= 3600 ? '1h' : windowSeconds <= 21600 ? '6h' : '24h';
    const missions = this.getMissionsInRange(timeRange).map(toMissionMetrics);
    const summary = this.calculateSummary(missions);
    const comparisons = this.getMissionsInRange(timeRange)
      .map(toShadowComparison)
      .filter((c): c is ShadowComparison => c != null);
    const shadow = this.calculateShadowStats(comparisons);

    return {
      metrics: {
        ...summary,
        averageCost: missions.length > 0 ? summary.totalCost / missions.length : 0,
        shadowMatchRate: shadow.matchRate,
        agentAvailability: Object.values(this.getSystemHealth().agentStatuses).filter(
          (s) => s === 'up',
        ).length,
        cacheHitRate: 1,
        updateAgeMs: Date.now() - this.lastMetricsUpdate,
        isFresh: Date.now() - this.lastMetricsUpdate < resolveFreshnessThresholdMs(),
      },
      process: {
        rssMb: this.processMetrics.rssMb,
        heapUsedMb: this.processMetrics.heapUsedMb,
      },
    };
  }

  getSystemHealth(): SystemHealth {
    const now = Date.now();
    const recent = getMissionHistory().slice(-100).map(toMissionMetrics);
    const successRate = this.calculateSuccessRate(recent);
    const errorRate = this.calculateErrorRate(recent);
    const agentStatuses = this.getAgentStatuses();
    const agentPerformance = this.calculateAgentPerformance(getMissionHistory());
    const agentDetails = buildAgentHealthDetails({ agentPerformance, agentStatuses });
    const configFlags = getMultiAgentConfigHealth(this.processMetrics.rssMb);
    const updateAgeMs = now - this.lastMetricsUpdate;
    const freshnessThresholdMs = resolveFreshnessThresholdMs();
    const isFresh = updateAgeMs < freshnessThresholdMs;

    let status: SystemHealth['status'] = 'healthy';
    if (errorRate > 0.1 || !configFlags.configValid) status = 'critical';
    else if (errorRate > 0.05 || !isFresh) status = 'degraded';

    const lastErrorRow = [...getMissionHistory()].reverse().find((m) => m.errors.length > 0);

    return {
      status,
      uptime: process.uptime(),
      errorRate,
      successRate,
      averageResponseTime: this.calculateAvgResponseTime(recent),
      activeMissions: getMissionHistory().filter(
        (m) => m.missionStatus === 'in_progress' || m.missionStatus === 'pending',
      ).length,
      queueSize: 0,
      agentStatuses,
      lastError: lastErrorRow?.errors[0],
      lastUpdate: new Date(this.lastMetricsUpdate).toISOString(),
      updateAgeMs,
      isFresh,
      updateIntervalSeconds: resolveUpdateIntervalSeconds(),
      configValid: configFlags.configValid,
      healthChecks: configFlags.healthChecks,
      capacityAvailable: configFlags.capacityAvailable,
      activeAgents: countActiveAgents(agentDetails),
      sleepingAgents: countSleepingAgents(agentDetails),
      healthScore: computeHealthScore({
        successRate,
        configValid: configFlags.configValid,
        isFresh,
        agentDetails,
      }),
      agentDetails,
    };
  }

  getShadowComparisons(opts: { limit?: number; offset?: number } = {}): ShadowComparison[] {
    const all = getMissionHistory()
      .map(toShadowComparison)
      .filter((c): c is ShadowComparison => c != null)
      .reverse();
    const offset = opts.offset ?? 0;
    const limit = opts.limit ?? 100;
    return all.slice(offset, offset + limit);
  }

  private calculateSummary(missions: MissionMetrics[]): DashboardSummaryMetrics {
    const total = missions.length;
    const success = missions.filter((m) => m.status === 'success').length;
    const failed = missions.filter((m) => m.status === 'failed').length;
    const hitl = missions.filter((m) => m.status === 'pending_human_review').length;
    const totalCost = missions.reduce((s, m) => s + m.cost, 0);
    const avgDuration =
      total > 0 ? missions.reduce((s, m) => s + m.duration, 0) / total : 0;

    return {
      totalRequests: total,
      successRate: total > 0 ? success / total : 1,
      averageResponseTime: avgDuration,
      errorRate: total > 0 ? failed / total : 0,
      hitlRate: total > 0 ? hitl / total : 0,
      totalCost,
    };
  }

  private calculateRequestsOverTime(missions: TelemetryData[]) {
    const buckets = new Map<string, { timestamp: Date; count: number; success: number; failed: number }>();
    for (const m of missions) {
      const d = new Date(m.timestamp);
      d.setMinutes(0, 0, 0);
      const key = d.toISOString();
      const bucket = buckets.get(key) ?? { timestamp: d, count: 0, success: 0, failed: 0 };
      bucket.count += 1;
      if (m.errors.length > 0 || m.missionStatus === 'failed') bucket.failed += 1;
      else bucket.success += 1;
      buckets.set(key, bucket);
    }
    return [...buckets.values()].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  private calculateIntentDistribution(missions: MissionMetrics[]) {
    const counts = new Map<string, number>();
    for (const m of missions) {
      counts.set(m.intent, (counts.get(m.intent) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([intent, count]) => ({ intent, count }))
      .sort((a, b) => b.count - a.count);
  }

  private calculateAgentPerformance(missions: TelemetryData[]): AgentMetrics[] {
    const byAgent = new Map<string, AgentMetrics>();
    for (const m of missions) {
      for (const agent of m.agentsUsed) {
        const name = String(agent);
        const row =
          byAgent.get(name) ??
          ({
            agentName: name,
            calls: 0,
            successRate: 0,
            averageLatency: 0,
            tokenUsage: 0,
            cost: 0,
            errors: [],
          } satisfies AgentMetrics);
        row.calls += 1;
        row.tokenUsage += m.tokenUsage?.byAgent?.[agent] ?? 0;
        row.averageLatency += m.duration;
        if (m.errors.length) row.errors.push(...m.errors);
        byAgent.set(name, row);
      }
    }

    return [...byAgent.values()].map((row) => ({
      ...row,
      averageLatency: row.calls > 0 ? row.averageLatency / row.calls : 0,
      successRate:
        row.calls > 0 ? Math.max(0, 1 - row.errors.length / row.calls) : 1,
      cost: row.tokenUsage * 0.000001,
    }));
  }

  private calculateCostOverTime(missions: TelemetryData[]) {
    const buckets = new Map<string, { timestamp: Date; cost: number }>();
    for (const m of missions) {
      const d = new Date(m.timestamp);
      d.setMinutes(0, 0, 0);
      const key = d.toISOString();
      const bucket = buckets.get(key) ?? { timestamp: d, cost: 0 };
      bucket.cost += m.costUsd ?? 0;
      buckets.set(key, bucket);
    }
    return [...buckets.values()].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  private calculateShadowStats(comparisons: ShadowComparison[]) {
    const total = comparisons.length;
    const matched = comparisons.filter((c) => c.matched).length;
    const deepSeekBetter = comparisons.filter((c) => c.deepSeekBetter).length;
    const currentBetter = comparisons.filter(
      (c) => !c.matched && !c.deepSeekBetter,
    ).length;
    return {
      matchRate: total > 0 ? matched / total : 1,
      deepSeekBetterRate: total > 0 ? deepSeekBetter / total : 0,
      currentBetterRate: total > 0 ? currentBetter / total : 0,
      samples: comparisons.slice(-20).reverse(),
    };
  }

  private calculateSuccessRate(missions: MissionMetrics[]): number {
    if (missions.length === 0) return 1;
    return missions.filter((m) => m.status === 'success').length / missions.length;
  }

  private calculateErrorRate(missions: MissionMetrics[]): number {
    if (missions.length === 0) return 0;
    return missions.filter((m) => m.status === 'failed').length / missions.length;
  }

  private calculateAvgResponseTime(missions: MissionMetrics[]): number {
    if (missions.length === 0) return 0;
    return missions.reduce((s, m) => s + m.duration, 0) / missions.length;
  }

  private getAgentStatuses(): Record<string, 'up' | 'down' | 'degraded'> {
    const agents = [
      'intent_classifier',
      'planner',
      'critic',
      'refiner',
      'specialist',
      'reasoning',
    ];
    const perf = this.calculateAgentPerformance(getMissionHistory());
    const out: Record<string, 'up' | 'down' | 'degraded'> = {};
    for (const name of agents) {
      const row = perf.find((p) => p.agentName === name);
      if (!row || row.calls === 0) {
        out[name] = 'up';
      } else if (row.successRate < 0.5) {
        out[name] = 'down';
      } else if (row.successRate < 0.85) {
        out[name] = 'degraded';
      } else {
        out[name] = 'up';
      }
    }
    return out;
  }
}

export const multiAgentMetricsStore = new MultiAgentMetricsStore();
