/**
 * Built-in Healing Actions (P6).
 */

import { getPrismaClient } from '../../lib/prisma.js';
import agentLifecycle from '../agents/agentLifecycle.js';
import agentRegistry from '../agents/agentRegistry.js';
import autoHeal from './autoHeal.js';

autoHeal.register({
  id: 'clear_failed_missions',
  name: 'Clear Failed Missions',
  priority: 80,
  condition: (issue) => issue.type === 'high_failure_rate',
  heal: async () => {
    const prisma = getPrismaClient();
    const result = await prisma.missionPipeline.updateMany({
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
    console.log(`[AutoHeal] Cleared ${result.count} old failed missions`);
  },
});

autoHeal.register({
  id: 'process_queue',
  name: 'Process Queue',
  priority: 70,
  condition: (issue) => issue.type === 'queue_backlog',
  heal: async () => {
    const prisma = getPrismaClient();
    const queued = await prisma.missionPipeline.findMany({
      where: { status: 'queued' },
      take: 5,
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });

    if (!queued.length) return;

    const { runMissionUntilBlocked } = await import('../../lib/missionPipelineOrchestrator.js');
    for (const mission of queued) {
      runMissionUntilBlocked(mission.id).catch((err) => {
        console.warn(`[AutoHeal] Queue kick failed for ${mission.id}:`, err?.message || err);
      });
    }
    console.log(`[AutoHeal] Kicked ${queued.length} queued missions`);
  },
});

autoHeal.register({
  id: 'restart_agents',
  name: 'Restart Agents',
  priority: 60,
  condition: (issue) => issue.type === 'unhealthy_agents',
  heal: async (issue) => {
    const ids = Array.isArray(issue?.agentIds)
      ? issue.agentIds
      : autoHeal.getUnhealthyAgents();

    for (const agentId of ids) {
      try {
        if (agentRegistry.get(agentId)) {
          agentLifecycle.start(agentId);
          console.log(`[AutoHeal] Restarted agent: ${agentId}`);
        }
      } catch (error) {
        console.warn(`[AutoHeal] Failed to restart ${agentId}:`, error?.message || error);
      }
    }
  },
});

autoHeal.register({
  id: 'reset_circuit_breakers',
  name: 'Reset Circuit Breakers',
  priority: 65,
  condition: (issue) =>
    issue.type === 'low_slo_success_rate' || issue.type === 'unhealthy_agents',
  heal: async () => {
    const { default: circuitBreaker } = await import('./circuitBreaker.js');
    circuitBreaker.reset('skill_execution');
    circuitBreaker.reset('agent_execution');
    console.log('[AutoHeal] Reset skill_execution and agent_execution circuit breakers');
  },
});

console.log('[BuiltinHeals] Registered built-in healing actions');
