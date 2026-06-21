/**
 * SLO/SLA Tracking Service (P6).
 */

import { getPrismaClient } from '../../lib/prisma.js';
import {
  isObservationSloEligible,
  isObservationSuccessRateEligible,
} from '../../lib/runtime/observationBus.js';
import {
  EXECUTION_STATES,
  isRealExecution,
  isSloSuccessState,
} from '../../lib/telemetry/executionStates.js';

export class SLOTracker {
  constructor() {
    /** @type {Map<string, object>} */
    this.objectives = new Map();
    /** @type {Array<object>} */
    this.breachHistory = [];
    this.maxBreachHistory = 500;
  }

  /**
   * @param {{ name: string; metric: string; target: { operator: string; value: number }; window?: string; severity?: string }} objective
   */
  define(objective) {
    const { name, metric, target, window, severity = 'medium' } = objective;
    this.objectives.set(name, {
      name,
      metric,
      target,
      window,
      severity,
      breaches: 0,
      evaluations: 0,
      lastValue: null,
      lastWithinTarget: true,
    });
    console.log(`[SLO] Defined: ${name} (target: ${target.operator} ${target.value})`);
  }

  /**
   * @returns {Promise<Array<object>>} Breaches detected in this evaluation
   */
  async evaluate() {
    const breaches = [];

    for (const [, objective] of this.objectives) {
      const metricResult = await this.getMetricWithStats(objective.metric);
      const value = metricResult.value;
      let withinTarget = this.isWithinTarget(value, objective.target);
      objective.evaluations++;
      objective.lastValue = value;
      objective.lastStats = metricResult.stats ?? null;

      const minSample = parseInt(process.env.SLO_MIN_SAMPLE_SIZE, 10) || 50;
      if (
        objective.metric === 'success_rate' &&
        metricResult.stats &&
        metricResult.stats.eligible < minSample
      ) {
        withinTarget = true;
      }

      const wasWithinTarget = objective.lastWithinTarget;
      objective.lastWithinTarget = withinTarget;

      if (!withinTarget) {
        objective.breaches++;
        const breach = {
          name: objective.name,
          metric: objective.metric,
          value,
          target: objective.target,
          severity: objective.severity,
          window: objective.window,
          stats: metricResult.stats ?? null,
          timestamp: new Date().toISOString(),
          isNewBreach: wasWithinTarget === true,
        };
        breaches.push(breach);
        console.warn(
          `[SLO] Breach: ${objective.name} (${value} vs ${objective.target.operator} ${objective.target.value})`,
        );
        this.recordBreach(breach);
      }
    }

    return breaches;
  }

  async getMetricWithStats(metric) {
    if (metric === 'success_rate') {
      const stats = await this.getSuccessRateStats();
      return { value: stats.rate, stats };
    }
    return { value: await this.getMetric(metric), stats: null };
  }

  async getMetric(metric) {
    switch (metric) {
      case 'success_rate': {
        const stats = await this.getSuccessRateStats();
        return stats.rate;
      }
      case 'latency_p95':
        return this.getLatencyP95();
      case 'queue_depth':
        return this.getQueueDepth();
      default:
        return 0;
    }
  }

  isWithinTarget(value, target) {
    if (!target || typeof target.value !== 'number') return true;
    if (target.operator === 'gte') return value >= target.value;
    if (target.operator === 'lte') return value <= target.value;
    if (target.operator === 'gt') return value > target.value;
    if (target.operator === 'lt') return value < target.value;
    return false;
  }

  recordBreach(breach) {
    this.breachHistory.push(breach);
    if (this.breachHistory.length > this.maxBreachHistory) {
      this.breachHistory.shift();
    }
  }

  parseSuccessRateWindowMs() {
    const raw = String(process.env.SLO_SUCCESS_RATE_WINDOW ?? '24h').trim().toLowerCase();
    if (raw.endsWith('h')) {
      const hours = parseInt(raw, 10);
      if (Number.isFinite(hours) && hours > 0) return hours * 60 * 60 * 1000;
    }
    if (raw.endsWith('m')) {
      const minutes = parseInt(raw, 10);
      if (Number.isFinite(minutes) && minutes > 0) return minutes * 60 * 1000;
    }
    return 24 * 60 * 60 * 1000;
  }

  async getSuccessRateStats() {
    const prisma = getPrismaClient();
    const since = new Date(Date.now() - this.parseSuccessRateWindowMs());

    try {
      const observations = await prisma.observation.findMany({
        where: { createdAt: { gte: since } },
        select: {
          outcome: true,
          error: true,
          actionType: true,
          intentType: true,
          contextSnapshot: true,
          executionState: true,
          isRealExecution: true,
        },
        take: 10_000,
        orderBy: { createdAt: 'desc' },
      });

      const eligible = observations.filter((row) =>
        isObservationSuccessRateEligible({
          outcome: row.outcome,
          error: row.error,
          actionType: row.actionType,
          intentType: row.intentType,
          contextSnapshot: row.contextSnapshot,
          executionState: row.executionState,
          isRealExecution: row.isRealExecution,
        }),
      );

      const success = eligible.filter(
        (row) =>
          row.outcome === 'success' &&
          (row.executionState ? isSloSuccessState(row.executionState) : true),
      ).length;
      const failures = eligible.length - success;
      const rate =
        eligible.length === 0 ? 100 : Math.round((success / eligible.length) * 1000) / 10;

      return {
        rate,
        eligible: eligible.length,
        success,
        failures,
        windowMs: this.parseSuccessRateWindowMs(),
        since: since.toISOString(),
      };
    } catch {
      return {
        rate: 100,
        eligible: 0,
        success: 0,
        failures: 0,
        windowMs: this.parseSuccessRateWindowMs(),
        since: new Date(Date.now() - this.parseSuccessRateWindowMs()).toISOString(),
      };
    }
  }

  async getSuccessRate() {
    const stats = await this.getSuccessRateStats();
    return stats.rate;
  }

  async getLatencyP95() {
    const prisma = getPrismaClient();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const maxLatencyMs = parseInt(process.env.SLO_MAX_LATENCY_MS, 10) || 120_000;

    try {
      const observations = await prisma.observation.findMany({
        where: {
          createdAt: { gte: since },
          latency: { gt: 0, lte: maxLatencyMs },
        },
        select: { latency: true, actionType: true, intentType: true, contextSnapshot: true },
        take: 2000,
        orderBy: { createdAt: 'desc' },
      });
      if (observations.length === 0) return 0;

      const sorted = observations
        .filter((o) =>
          isObservationSloEligible({
            actionType: o.actionType,
            intentType: o.intentType,
            contextSnapshot: o.contextSnapshot,
            latency: o.latency,
          }),
        )
        .map((o) => Number(o.latency) || 0)
        .filter((ms) => ms > 0 && ms <= maxLatencyMs)
        .sort((a, b) => a - b);
      if (sorted.length === 0) return 0;

      const index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
      return sorted[index] ?? 0;
    } catch {
      return 0;
    }
  }

  async getQueueDepth() {
    const prisma = getPrismaClient();
    try {
      return prisma.missionPipeline.count({ where: { status: 'queued' } });
    } catch {
      return 0;
    }
  }

  getObjectives() {
    return [...this.objectives.values()].map((o) => ({
      name: o.name,
      metric: o.metric,
      target: o.target,
      window: o.window,
      severity: o.severity,
      breaches: o.breaches,
      evaluations: o.evaluations,
      lastValue: o.lastValue,
      lastWithinTarget: o.lastWithinTarget,
      stats: o.lastStats ?? null,
    }));
  }

  getBreachHistory(limit = 50) {
    return this.breachHistory.slice(-limit);
  }

  /**
   * Top failure patterns in the SLO window (for diagnostics).
   */
  async getFailurePatterns(limit = 10) {
    const prisma = getPrismaClient();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    try {
      const rows = await prisma.observation.findMany({
        where: { outcome: 'failure', createdAt: { gte: since } },
        select: {
          actionType: true,
          intentType: true,
          error: true,
          contextSnapshot: true,
          executionState: true,
          isRealExecution: true,
        },
        take: 2000,
        orderBy: { createdAt: 'desc' },
      });

      /** @type {Map<string, { count: number; errors: string[]; sloEligible: number }>} */
      const realMap = new Map();
      /** @type {Map<string, { count: number; errors: string[] }>} */
      const stubMap = new Map();

      for (const row of rows) {
        const action = String(row.actionType || 'unknown');
        const sloCounted = isObservationSuccessRateEligible({
          outcome: 'failure',
          error: row.error,
          actionType: row.actionType,
          intentType: row.intentType,
          contextSnapshot: row.contextSnapshot,
          executionState: row.executionState,
          isRealExecution: row.isRealExecution,
        });
        const isStub =
          row.executionState === EXECUTION_STATES.STUBBED ||
          row.isRealExecution === false ||
          !isRealExecution(row.executionState);

        const targetMap = isStub ? stubMap : realMap;
        const current = targetMap.get(action) ?? { count: 0, errors: [], sloEligible: 0 };
        current.count += 1;
        if (sloCounted) current.sloEligible += 1;
        if (row.error && current.errors.length < 3) {
          current.errors.push(String(row.error));
        }
        targetMap.set(action, current);
      }

      const realFailures = [...realMap.entries()]
        .map(([action, data]) => ({
          action,
          count: data.count,
          sloEligibleFailures: data.sloEligible,
          errors: data.errors,
          kind: 'real',
        }))
        .sort((a, b) => b.sloEligibleFailures - a.sloEligibleFailures || b.count - a.count)
        .slice(0, limit);

      const stubFailures = [...stubMap.entries()]
        .map(([action, data]) => ({
          action,
          count: data.count,
          sloEligibleFailures: 0,
          errors: data.errors,
          kind: 'stub',
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);

      return {
        realFailures,
        stubFailures,
        totalRealFailures: realFailures.reduce((sum, row) => sum + row.count, 0),
        totalStubFailures: stubFailures.reduce((sum, row) => sum + row.count, 0),
        patterns: realFailures,
      };
    } catch {
      return {
        realFailures: [],
        stubFailures: [],
        totalRealFailures: 0,
        totalStubFailures: 0,
        patterns: [],
      };
    }
  }

  async getExecutionStateStats(windowMs = 24 * 60 * 60 * 1000) {
    const prisma = getPrismaClient();
    const since = new Date(Date.now() - windowMs);

    try {
      const rows = await prisma.observation.findMany({
        where: { createdAt: { gte: since } },
        select: {
          outcome: true,
          executionState: true,
          isRealExecution: true,
        },
        take: 10_000,
        orderBy: { createdAt: 'desc' },
      });

      const realRows = rows.filter((row) => row.isRealExecution !== false && isRealExecution(row.executionState));
      const stubRows = rows.filter((row) => row.executionState === EXECUTION_STATES.STUBBED);
      const plannedRows = rows.filter((row) => row.executionState === EXECUTION_STATES.PLANNED);

      const realSuccess = realRows.filter(
        (row) => row.outcome === 'success' && isSloSuccessState(row.executionState),
      ).length;
      const realFailures = realRows.filter((row) => row.outcome === 'failure').length;
      const stubSuccess = stubRows.filter((row) => row.outcome === 'success').length;
      const stubFailures = stubRows.filter((row) => row.outcome === 'failure').length;

      return {
        realSuccessRate:
          realRows.length > 0 ? Math.round((realSuccess / realRows.length) * 1000) / 10 : 100,
        stubSuccessRate:
          stubRows.length > 0 ? Math.round((stubSuccess / stubRows.length) * 1000) / 10 : 0,
        realFailures,
        stubFailures,
        plannedCount: plannedRows.length,
        realExecutions: realRows.length,
        stubExecutions: stubRows.length,
        windowMs,
        since: since.toISOString(),
      };
    } catch {
      return {
        realSuccessRate: 100,
        stubSuccessRate: 0,
        realFailures: 0,
        stubFailures: 0,
        plannedCount: 0,
        realExecutions: 0,
        stubExecutions: 0,
        windowMs,
        since: since.toISOString(),
      };
    }
  }

  resetForTests() {
    this.objectives.clear();
    this.breachHistory = [];
  }
}

const sloTracker = new SLOTracker();
export default sloTracker;
