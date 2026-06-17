/**
 * Auto-Healing Service — automatic recovery from failures (P6).
 */

import { getPrismaClient } from '../../lib/prisma.js';
import agentRegistry from '../agents/agentRegistry.js';

export class AutoHealService {
  constructor() {
    /** @type {Map<string, object>} */
    this.healingActions = new Map();
    /** @type {Array<object>} */
    this.healingHistory = [];
    this.maxHistory = 1000;
    this.isRunning = false;
    this.interval = parseInt(process.env.AUTO_HEAL_INTERVAL_MS, 10) || 30_000;
    /** @type {ReturnType<typeof setInterval>|null} */
    this._timer = null;
    /** @type {Map<string, number>} */
    this.lastHealTime = new Map();
    this.cooldownMs = parseInt(process.env.AUTO_HEAL_COOLDOWN_MS, 10) || 60_000;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this._timer = setInterval(() => {
      this.scan().catch((err) => {
        console.error('[AutoHeal] Scan error:', err?.message || err);
      });
    }, this.interval);
    if (typeof this._timer?.unref === 'function') {
      this._timer.unref();
    }
    console.log('[AutoHeal] Auto-healing service started');
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this.isRunning = false;
  }

  isCooldownActive(issueType) {
    const last = this.lastHealTime.get(issueType);
    return typeof last === 'number' && Date.now() - last < this.cooldownMs;
  }

  /**
   * @param {{ id: string; name: string; condition?: (issue: object) => boolean; heal: (issue: object) => Promise<void>; priority?: number }} action
   */
  register(action) {
    const { id, name, condition, heal, priority = 50 } = action;
    this.healingActions.set(id, { id, name, condition, heal, priority });
    console.log(`[AutoHeal] Registered: ${name} (${id})`);
  }

  async scan() {
    const issues = await this.detectIssues();
    if (issues.length === 0) return;

    for (const issue of issues) {
      await this.healIssue(issue);
    }
  }

  async detectIssues() {
    const issues = [];
    const prisma = getPrismaClient();

    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const failedMissions = await prisma.missionPipeline.count({
        where: {
          status: 'failed',
          updatedAt: { gte: fiveMinutesAgo },
        },
      });
      if (failedMissions > 5 && !this.isCooldownActive('high_failure_rate')) {
        issues.push({
          type: 'high_failure_rate',
          severity: 'critical',
          description: `${failedMissions} failed missions in last 5 minutes`,
          actions: ['clear_failed_missions', 'restart_agents'],
        });
      }

      const queuedMissions = await prisma.missionPipeline.count({
        where: { status: 'queued' },
      });
      if (queuedMissions > 50 && !this.isCooldownActive('queue_backlog')) {
        issues.push({
          type: 'queue_backlog',
          severity: 'high',
          description: `${queuedMissions} missions in queue`,
          actions: ['process_queue'],
        });
      }
    } catch (error) {
      console.warn('[AutoHeal] Mission pipeline checks skipped:', error?.message || error);
    }

    if (!this.isCooldownActive('unhealthy_agents')) {
      const unhealthyAgents = this.getUnhealthyAgents();
      if (unhealthyAgents.length > 0) {
        issues.push({
          type: 'unhealthy_agents',
          severity: 'medium',
          description: `${unhealthyAgents.length} agents unhealthy: ${unhealthyAgents.join(', ')}`,
          actions: ['restart_agents'],
          agentIds: unhealthyAgents,
        });
      }
    }

    return issues;
  }

  /**
   * Agents needing heal — explicit unhealthy state only (not idle stale heartbeat).
   */
  getUnhealthyAgents() {
    return agentRegistry
      .list()
      .filter((agent) => {
        if (agent.status === 'terminated' || agent.status === 'paused') return true;
        const health = agentRegistry.getHealth(agent.id);
        if (!health) return false;
        const status = String(health.status ?? '').toLowerCase();
        return status === 'unhealthy' || status === 'degraded' || status === 'failed';
      })
      .map((agent) => agent.id);
  }

  async healIssue(issue) {
    console.log(`[AutoHeal] Healing: ${issue.type} (${issue.severity})`);
    this.lastHealTime.set(issue.type, Date.now());

    const start = Date.now();
    let success = false;

    for (const actionId of issue.actions ?? []) {
      try {
        const handler = this.healingActions.get(actionId);
        if (handler?.heal) {
          await handler.heal(issue);
          success = true;
        } else {
          await this.defaultHeal(actionId, issue);
          success = true;
        }
      } catch (error) {
        console.error(`[AutoHeal] Healing action ${actionId} failed:`, error?.message || error);
      }
    }

    this.healingHistory.push({
      issue: issue.type,
      severity: issue.severity,
      success,
      duration: Date.now() - start,
      timestamp: new Date().toISOString(),
    });

    if (this.healingHistory.length > this.maxHistory) {
      this.healingHistory.shift();
    }

    return success;
  }

  async defaultHeal(action, issue) {
    const prisma = getPrismaClient();

    switch (action) {
      case 'clear_failed_missions':
        await prisma.missionPipeline.updateMany({
          where: {
            status: 'failed',
            updatedAt: { lt: new Date(Date.now() - 10 * 60 * 1000) },
          },
          data: {
            status: 'cancelled',
            cancelledAt: new Date(),
            runState: 'done',
          },
        });
        console.log('[AutoHeal] Cleared old failed missions');
        break;

      case 'process_queue':
        console.log('[AutoHeal] Queue processing triggered');
        break;

      case 'restart_agents':
        console.log('[AutoHeal] Agent restart triggered');
        break;

      default:
        console.log(`[AutoHeal] No default action for: ${action}`, issue?.type ?? '');
    }
  }

  getHistory(limit = 50) {
    return this.healingHistory.slice(-limit);
  }

  async getHealthScore() {
    const prisma = getPrismaClient();

    try {
      const total = await prisma.missionPipeline.count();
      const failed = await prisma.missionPipeline.count({ where: { status: 'failed' } });
      const successRate = total > 0 ? ((total - failed) / total) * 100 : 100;

      const queued = await prisma.missionPipeline.count({ where: { status: 'queued' } });
      const queueHealth = queued < 10 ? 100 : Math.max(0, 100 - queued);

      const recentHeals = this.healingHistory.filter(
        (h) => Date.now() - new Date(h.timestamp).getTime() < 60 * 60 * 1000,
      );
      const healHealth = recentHeals.length < 5 ? 100 : Math.max(0, 100 - recentHeals.length * 5);

      return Math.round(successRate * 0.5 + queueHealth * 0.3 + healHealth * 0.2);
    } catch {
      const unhealthy = this.getUnhealthyAgents().length;
      return Math.max(0, 100 - unhealthy * 15);
    }
  }

  resetForTests() {
    this.stop();
    this.healingHistory = [];
    this.lastHealTime.clear();
  }
}

const autoHeal = new AutoHealService();
export default autoHeal;
