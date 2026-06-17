/**
 * Agent Lifecycle — start, pause, resume, terminate, heartbeat.
 */

import agentRegistry from './agentRegistry.js';
import messageBus from './messageBus.js';

const DEFAULT_AGENT_IDS = [
  'analytics_agent',
  'creative_agent',
  'optimizer_agent',
  'concierge_agent',
];

/** @type {ReturnType<typeof setInterval>|null} */
let heartbeatTimer = null;

export class AgentLifecycle {
  /**
   * @param {{ registry?: typeof agentRegistry; bus?: typeof messageBus }} [deps]
   */
  constructor(deps = {}) {
    this.registry = deps.registry ?? agentRegistry;
    this.bus = deps.bus ?? messageBus;
  }

  /**
   * @param {string} agentId
   */
  start(agentId) {
    const agent = this.registry.get(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    this.registry.setStatus(agentId, 'active');
    this.registry.updateHealth(agentId, { status: 'healthy' });

    this.bus.publish(agentId, {
      type: 'lifecycle_started',
      from: 'lifecycle',
      agentId,
    });

    return this.registry.get(agentId);
  }

  /**
   * @param {string} agentId
   */
  pause(agentId) {
    const agent = this.registry.get(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    this.registry.setStatus(agentId, 'paused');
    this.bus.publish(agentId, { type: 'lifecycle_paused', from: 'lifecycle', agentId });
    return this.registry.get(agentId);
  }

  /**
   * @param {string} agentId
   */
  resume(agentId) {
    const agent = this.registry.get(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    this.registry.setStatus(agentId, 'active');
    this.registry.updateHealth(agentId, { status: 'healthy' });

    this.bus.publish(agentId, { type: 'lifecycle_resumed', from: 'lifecycle', agentId });
    return this.registry.get(agentId);
  }

  /**
   * @param {string} agentId
   */
  terminate(agentId) {
    const agent = this.registry.get(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    this.registry.setStatus(agentId, 'terminated');
    this.registry.updateHealth(agentId, { status: 'unhealthy' });
    this.bus.publish(agentId, { type: 'lifecycle_terminated', from: 'lifecycle', agentId });
    return this.registry.get(agentId);
  }

  /**
   * @param {string} agentId
   * @param {object} [details]
   */
  heartbeat(agentId, details = {}) {
    const agent = this.registry.get(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    const health = this.registry.updateHealth(agentId, {
      status: 'healthy',
      ...details,
    });

    this.bus.publish(agentId, {
      type: 'heartbeat',
      from: agentId,
      health,
    });

    return health;
  }

  /**
   * @param {string} agentId
   */
  checkHealth(agentId) {
    const agent = this.registry.get(agentId);
    if (!agent) return { ok: false, error: 'agent_not_found' };

    return {
      ok: true,
      agentId,
      status: agent.status,
      healthy: this.registry.isHealthy(agentId),
      health: this.registry.getHealth(agentId),
      load: this.registry.getLoad(agentId),
    };
  }
}

const agentLifecycle = new AgentLifecycle();

/**
 * Ensure built-in agents are active and healthy (idempotent).
 *
 * @param {string[]} [agentIds]
 */
export function initializeAgents(agentIds = DEFAULT_AGENT_IDS) {
  for (const agentId of agentIds) {
    try {
      const agent = agentRegistry.get(agentId);
      if (!agent) continue;
      if (agent.status !== 'active') {
        agentLifecycle.start(agentId);
        console.log(`[AgentLifecycle] Auto-started ${agentId}`);
      } else {
        agentLifecycle.heartbeat(agentId);
      }
    } catch (error) {
      console.warn(`[AgentLifecycle] Failed to auto-start ${agentId}:`, error?.message || error);
    }
  }
}

/**
 * Keep active agents healthy — registry marks stale heartbeats as unhealthy after 60s.
 *
 * @param {number} [intervalMs]
 */
export function startAgentHeartbeatLoop(intervalMs) {
  if (heartbeatTimer || process.env.VITEST === 'true') return;

  const resolvedInterval =
    intervalMs ??
    (parseInt(process.env.AGENT_HEARTBEAT_INTERVAL_MS, 10) ||
      (process.env.CARDEY_DEPLOY_ENV === 'staging' ? 15_000 : 30_000));

  const tick = () => {
    initializeAgents();
    for (const agent of agentRegistry.list()) {
      if (agent.status !== 'active') continue;
      try {
        agentLifecycle.heartbeat(agent.id);
      } catch (error) {
        console.warn(
          `[AgentLifecycle] Heartbeat failed for ${agent.id}:`,
          error?.message || error,
        );
      }
    }
  };

  tick();
  heartbeatTimer = setInterval(tick, resolvedInterval);

  if (typeof heartbeatTimer?.unref === 'function') {
    heartbeatTimer.unref();
  }

  console.log(`[AgentLifecycle] Heartbeat loop started (${resolvedInterval}ms)`);
}

export function stopAgentHeartbeatLoop() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

export default agentLifecycle;
