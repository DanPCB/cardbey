/**
 * Agent Registry — register, discover, and manage sub-agents.
 */

export const AGENT_STATUSES = ['registered', 'active', 'paused', 'terminated'];

export class AgentRegistry {
  constructor() {
    /** @type {Map<string, object>} */
    this.agents = new Map();
    /** @type {Map<string, string[]>} */
    this.capabilities = new Map();
    /** @type {Map<string, object>} */
    this.health = new Map();
    /** @type {Map<string, number>} */
    this.load = new Map();
  }

  /**
   * @param {object} agent
   */
  register(agent) {
    const {
      id,
      name,
      description,
      capabilities,
      version,
      endpoints,
      config,
      skillId,
      handler,
    } = agent ?? {};

    if (!id) throw new Error('Agent ID is required');
    if (!name) throw new Error('Agent name is required');
    if (!Array.isArray(capabilities) || capabilities.length === 0) {
      throw new Error('Agent must have at least one capability');
    }

    const existing = this.agents.get(id);
    if (existing) {
      for (const cap of existing.capabilities ?? []) {
        const ids = this.capabilities.get(cap) ?? [];
        this.capabilities.set(
          cap,
          ids.filter((entry) => entry !== id),
        );
      }
    }

    const record = {
      id: String(id),
      name: String(name),
      description: description ? String(description) : '',
      capabilities: capabilities.map(String),
      version: version ? String(version) : '1.0.0',
      endpoints: endpoints && typeof endpoints === 'object' ? endpoints : {},
      config: config && typeof config === 'object' ? config : {},
      skillId: skillId ? String(skillId) : null,
      handler: typeof handler === 'function' ? handler : null,
      status: existing?.status === 'active' ? 'active' : 'registered',
      registeredAt: existing?.registeredAt ?? new Date(),
      lastHeartbeat: new Date(),
    };

    this.agents.set(id, record);
    this.load.set(id, this.load.get(id) ?? 0);

    for (const cap of record.capabilities) {
      if (!this.capabilities.has(cap)) {
        this.capabilities.set(cap, []);
      }
      const ids = this.capabilities.get(cap);
      if (!ids.includes(id)) ids.push(id);
    }

    console.log(`[AgentRegistry] Registered agent: ${id} (${name})`);
    return record;
  }

  /**
   * @param {string} id
   */
  unregister(id) {
    const agent = this.agents.get(id);
    if (!agent) return false;

    for (const cap of agent.capabilities ?? []) {
      const ids = this.capabilities.get(cap) ?? [];
      this.capabilities.set(
        cap,
        ids.filter((entry) => entry !== id),
      );
    }

    this.agents.delete(id);
    this.health.delete(id);
    this.load.delete(id);
    return true;
  }

  /**
   * @param {string} id
   */
  get(id) {
    return this.agents.get(id) ?? null;
  }

  /**
   * @param {string} capability
   */
  findByCapability(capability) {
    const cap = String(capability ?? '').trim();
    const ids = this.capabilities.get(cap) ?? [];
    return ids
      .map((agentId) => this.agents.get(agentId))
      .filter((agent) => agent && agent.status !== 'terminated');
  }

  /**
   * @param {string} capability
   */
  findBestAgent(capability) {
    const agents = this.findByCapability(capability);
    if (agents.length === 0) return null;

    const scored = agents
      .map((agent) => ({
        agent,
        score: this.getHealthScore(agent.id),
      }))
      .sort((a, b) => b.score - a.score);

    return scored[0]?.agent ?? null;
  }

  /**
   * @param {string} id
   * @param {object} health
   */
  updateHealth(id, health) {
    const agent = this.agents.get(id);
    if (!agent) return null;

    const record = {
      ...(this.health.get(id) ?? {}),
      ...(health && typeof health === 'object' ? health : {}),
      updatedAt: new Date(),
    };

    this.health.set(id, record);
    agent.lastHeartbeat = new Date();
    return record;
  }

  /**
   * @param {string} id
   */
  isHealthy(id) {
    const agent = this.agents.get(id);
    if (!agent || agent.status === 'terminated' || agent.status === 'paused') {
      return false;
    }

    const health = this.health.get(id);
    if (!health) return agent.status === 'active';

    const status = String(health.status ?? '').toLowerCase();
    if (status === 'unhealthy' || status === 'degraded' || status === 'failed') {
      return false;
    }

    const intervalMs = parseInt(process.env.AGENT_HEARTBEAT_INTERVAL_MS, 10) || 30_000;
    const staleMs =
      parseInt(process.env.AGENT_HEARTBEAT_STALE_MS, 10) || Math.max(120_000, intervalMs * 4);
    const heartbeatAge = Date.now() - new Date(health.updatedAt || 0).getTime();
    if (heartbeatAge > staleMs) return false;

    return agent.status === 'active';
  }

  /**
   * @param {string} id
   */
  getHealthScore(id) {
    if (!this.isHealthy(id)) return 0;
    const load = this.load.get(id) ?? 0;
    return Math.max(0, 100 - load * 10);
  }

  /**
   * @param {string} id
   * @param {number} delta
   */
  adjustLoad(id, delta) {
    const current = this.load.get(id) ?? 0;
    const next = Math.max(0, current + delta);
    this.load.set(id, next);
    return next;
  }

  /**
   * @param {string} id
   * @param {string} status
   */
  setStatus(id, status) {
    const agent = this.agents.get(id);
    if (!agent) return null;
    if (!AGENT_STATUSES.includes(status)) {
      throw new Error(`Invalid agent status: ${status}`);
    }
    agent.status = status;
    agent.lastHeartbeat = new Date();
    return agent;
  }

  /**
   * @param {string} id
   */
  getHealth(id) {
    return this.health.get(id) ?? null;
  }

  /**
   * @param {string} id
   */
  getLoad(id) {
    return this.load.get(id) ?? 0;
  }

  /**
   * @param {object} [filter]
   */
  list(filter = {}) {
    let agents = Array.from(this.agents.values());

    if (filter.capability) {
      const cap = String(filter.capability);
      agents = agents.filter((agent) => agent.capabilities.includes(cap));
    }
    if (filter.status) {
      agents = agents.filter((agent) => agent.status === filter.status);
    }

    return agents.map((agent) => ({
      ...agent,
      handler: undefined,
      healthy: this.isHealthy(agent.id),
      load: this.load.get(agent.id) ?? 0,
      health: this.health.get(agent.id) ?? null,
    }));
  }

  resetForTests() {
    this.agents.clear();
    this.capabilities.clear();
    this.health.clear();
    this.load.clear();
  }
}

const agentRegistry = new AgentRegistry();
export default agentRegistry;
