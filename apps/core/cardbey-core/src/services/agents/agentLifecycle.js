/**
 * Agent Lifecycle — start, pause, resume, terminate, heartbeat.
 */

import agentRegistry from './agentRegistry.js';
import messageBus from './messageBus.js';

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
export default agentLifecycle;
