/**
 * SLO/SLA Tracking Service (P6).
 */

import { getPrismaClient } from '../../lib/prisma.js';
import { isObservationSloEligible } from '../../lib/runtime/observationBus.js';

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
      const value = await this.getMetric(objective.metric);
      const withinTarget = this.isWithinTarget(value, objective.target);
      objective.evaluations++;
      objective.lastValue = value;
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
          timestamp: new Date().toISOString(),
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

  async getMetric(metric) {
    switch (metric) {
      case 'success_rate':
        return this.getSuccessRate();
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

  async getSuccessRate() {
    const prisma = getPrismaClient();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    try {
      const observations = await prisma.observation.findMany({
        where: { createdAt: { gte: since } },
        select: {
          outcome: true,
          actionType: true,
          intentType: true,
          contextSnapshot: true,
        },
        take: 5000,
        orderBy: { createdAt: 'desc' },
      });

      const eligible = observations.filter((row) =>
        isObservationSloEligible({
          actionType: row.actionType,
          intentType: row.intentType,
          contextSnapshot: row.contextSnapshot,
        }),
      );

      if (eligible.length === 0) return 100;

      const success = eligible.filter((row) => row.outcome === 'success').length;
      return (success / eligible.length) * 100;
    } catch {
      return 100;
    }
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
    }));
  }

  getBreachHistory(limit = 50) {
    return this.breachHistory.slice(-limit);
  }

  resetForTests() {
    this.objectives.clear();
    this.breachHistory = [];
  }
}

const sloTracker = new SLOTracker();
export default sloTracker;
