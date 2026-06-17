/**
 * Sub-agent Orchestrator — parallel execution, chain handoff, delegation, failover.
 */

import { randomUUID } from 'crypto';
import agentRegistry from './agentRegistry.js';
import messageBus from './messageBus.js';
import agentSharedMemory from './agentSharedMemory.js';
import agentLifecycle from './agentLifecycle.js';
import { ensureRuntimeAuthorizedContext } from '../../lib/runtime/performerRuntime/runtimeOwnership.js';
import bulkhead from '../reliability/bulkhead.js';
import observationBus from '../../lib/runtime/observationBus.js';

export class SubAgentOrchestrator {
  /**
   * @param {{
   *   registry?: typeof agentRegistry;
   *   bus?: typeof messageBus;
   *   sharedMemory?: typeof agentSharedMemory;
   *   lifecycle?: typeof agentLifecycle;
   *   skillExecutor?: (skillId: string, context: object) => Promise<object>;
   *   httpFetch?: typeof fetch;
   * }} [deps]
   */
  constructor(deps = {}) {
    this.registry = deps.registry ?? agentRegistry;
    this.bus = deps.bus ?? messageBus;
    this.sharedMemory = deps.sharedMemory ?? agentSharedMemory;
    this.lifecycle = deps.lifecycle ?? agentLifecycle;
    this.skillExecutor = deps.skillExecutor ?? null;
    this.httpFetch = deps.httpFetch ?? fetch;
  }

  /**
   * @param {object} context
   */
  resolveOrchestrationId(context = {}) {
    return context.orchestrationId ? String(context.orchestrationId) : randomUUID();
  }

  /**
   * @param {Array<{ id: string; skillId?: string }>} agents
   * @param {object} context
   */
  async parallel(agents, context = {}) {
    const orchestrationId = this.resolveOrchestrationId(context);
    let bundle = null;

    try {
      bundle = await this.sharedMemory.loadBundle(context);
    } catch (error) {
      console.warn('[Orchestrator] Shared memory load failed:', error?.message || error);
    }

    const baseContext = this.sharedMemory.buildAgentContext(context, orchestrationId, bundle);
    const tasks = agents.map((agent) => this.executeAgent(agent, baseContext, { orchestrationId }));

    const results = await Promise.allSettled(tasks);

    return {
      orchestrationId,
      results: results.map((result, index) => ({
        agent: agents[index].id,
        status: result.status,
        result: result.status === 'fulfilled' ? result.value : null,
        error:
          result.status === 'rejected'
            ? result.reason?.message || String(result.reason)
            : null,
      })),
      successCount: results.filter((result) => result.status === 'fulfilled').length,
      failureCount: results.filter((result) => result.status === 'rejected').length,
      sharedMemory: this.sharedMemory.getWorkspace(orchestrationId),
    };
  }

  /**
   * @param {Array<{ id: string; skillId?: string }>} agents
   * @param {object} context
   */
  async chain(agents, context = {}) {
    const orchestrationId = this.resolveOrchestrationId(context);
    let bundle = null;

    try {
      bundle = await this.sharedMemory.loadBundle(context);
    } catch (error) {
      console.warn('[Orchestrator] Shared memory load failed:', error?.message || error);
    }

    let previousResult = null;
    const chainResults = [];
    let agentContext = this.sharedMemory.buildAgentContext(context, orchestrationId, bundle);

    for (let index = 0; index < agents.length; index += 1) {
      const agent = agents[index];
      const nextAgent = agents[index + 1];

      agentContext = {
        ...agentContext,
        previousResult,
        handoffFrom: index > 0 ? agents[index - 1].id : null,
      };

      const result = await this.executeAgent(agent, agentContext, { orchestrationId });
      previousResult = result;
      chainResults.push({ agent: agent.id, result });

      this.sharedMemory.recordAgentResult(orchestrationId, agent.id, result);

      if (nextAgent) {
        this.sharedMemory.shareBetweenAgents(orchestrationId, agent.id, nextAgent.id, result);
        this.bus.publish(nextAgent.id, {
          type: 'handoff',
          from: agent.id,
          to: nextAgent.id,
          topic: 'agent_handoff',
          data: result,
        });
      }
    }

    return {
      orchestrationId,
      chainResults,
      finalResult: previousResult,
      sharedMemory: this.sharedMemory.getWorkspace(orchestrationId),
    };
  }

  /**
   * Delegate execution to the best agent for a capability.
   * @param {string} capability
   * @param {object} context
   */
  async delegate(capability, context = {}) {
    const agent = this.registry.findBestAgent(capability);
    if (!agent) {
      throw new Error(`No agent found for capability: ${capability}`);
    }

    return this.executeAgent(
      { id: agent.id, skillId: agent.skillId ?? undefined },
      { ...context, requiredCapability: capability, delegated: true },
    );
  }

  /**
   * @param {{ id: string; skillId?: string }} agent
   * @param {object} context
   * @param {{ orchestrationId?: string; allowFailover?: boolean }} [options]
   */
  async executeAgent(agent, context = {}, options = {}) {
    const agentId = String(agent?.id ?? '').trim();
    if (!agentId) throw new Error('Agent id is required');

    const authorizedContext = ensureRuntimeAuthorizedContext(
      {
        ...context,
        agentId,
        source: context.source ?? 'sub_agent_orchestrator',
      },
      context.runtimeId ?? null,
      'sub_agent_orchestrator',
    );

    const registered = this.registry.get(agentId);
    if (!registered) {
      throw new Error(`Agent ${agentId} not found`);
    }

    if (!this.registry.isHealthy(agentId)) {
      if (options.allowFailover !== false) {
        const failoverResult = await this.failover(agentId, authorizedContext);
        if (failoverResult) return failoverResult;
      }
      throw new Error(`Agent ${agentId} is not healthy`);
    }

    const requiredCapability = authorizedContext.requiredCapability
      ? String(authorizedContext.requiredCapability)
      : null;
    if (requiredCapability && !registered.capabilities.includes(requiredCapability)) {
      throw new Error(`Agent ${agentId} does not have capability: ${requiredCapability}`);
    }

    const orchestrationId =
      options.orchestrationId ?? this.resolveOrchestrationId(authorizedContext);

    this.registry.adjustLoad(agentId, 1);
    console.log(`[Orchestrator] Executing agent: ${agentId}`);

    this.bus.publish(agentId, {
      type: 'execution_started',
      from: 'orchestrator',
      context: authorizedContext,
      orchestrationId,
    });

    const execStart = Date.now();

    try {
      const result = await bulkhead.execute('agent_execution', () =>
        this.dispatchToAgent(
          { ...agent, skillId: agent.skillId ?? registered.skillId ?? undefined },
          authorizedContext,
        ),
      );

      void observationBus
        .emit({
          missionId: authorizedContext.missionId ?? null,
          intent: { type: 'run_agent' },
          action: `agent:${agentId}`,
          result: { success: true },
          metadata: {
            latency: Date.now() - execStart,
            storeId: authorizedContext.storeId ?? null,
            userId: authorizedContext.userId ?? null,
            source: authorizedContext.source ?? 'sub_agent_orchestrator',
          },
        })
        .catch(() => {});

      this.sharedMemory.recordAgentResult(orchestrationId, agentId, result);
      this.lifecycle.heartbeat(agentId, { lastExecution: 'success' });

      this.bus.publish(agentId, {
        type: 'execution_completed',
        from: 'orchestrator',
        result,
        orchestrationId,
      });

      return result;
    } catch (error) {
      void observationBus
        .emit({
          missionId: authorizedContext.missionId ?? null,
          intent: { type: 'run_agent' },
          action: `agent:${agentId}`,
          result: { success: false, error: error?.message || String(error) },
          metadata: {
            latency: Date.now() - execStart,
            storeId: authorizedContext.storeId ?? null,
            userId: authorizedContext.userId ?? null,
            source: authorizedContext.source ?? 'sub_agent_orchestrator',
          },
        })
        .catch(() => {});

      this.bus.publish(agentId, {
        type: 'execution_error',
        from: 'orchestrator',
        error: error?.message || String(error),
        orchestrationId,
      });

      if (options.allowFailover !== false) {
        const failoverResult = await this.failover(agentId, authorizedContext);
        if (failoverResult) return failoverResult;
      }

      throw error;
    } finally {
      this.registry.adjustLoad(agentId, -1);
    }
  }

  /**
   * @param {{ id: string; skillId?: string }} agent
   * @param {object} context
   */
  async dispatchToAgent(agent, context) {
    const authorizedContext = ensureRuntimeAuthorizedContext(context, null, 'sub_agent_dispatch');
    const registered = this.registry.get(agent.id);
    if (!registered) throw new Error(`Agent ${agent.id} not found`);

    if (typeof registered.handler === 'function') {
      return registered.handler(authorizedContext, { agent: registered });
    }

    const executeUrl = registered.endpoints?.execute;
    if (executeUrl && String(executeUrl).startsWith('http')) {
      const response = await this.httpFetch(String(executeUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authorizedContext),
      });
      if (!response.ok) {
        throw new Error(`Agent HTTP dispatch failed (${response.status})`);
      }
      return response.json();
    }

    const skillId = agent.skillId || registered.skillId || agent.id;
    if (this.skillExecutor) {
      return this.skillExecutor(String(skillId), authorizedContext);
    }

    const { default: compositionEngine } = await import('../skills/compositionEngine.js');
    return compositionEngine.executeSkill({ id: String(skillId) }, authorizedContext);
  }

  /**
   * @param {string} agentId
   * @param {object} context
   */
  async failover(agentId, context = {}) {
    const failed = this.registry.get(agentId);
    if (!failed) return null;

    const capability =
      context.requiredCapability || failed.capabilities[0] || null;
    if (!capability) return null;

    const candidates = this.registry
      .findByCapability(capability)
      .filter((agent) => agent.id !== agentId);

    for (const alternative of candidates) {
      if (!this.registry.isHealthy(alternative.id)) continue;

      console.log(`[Orchestrator] Failing over from ${agentId} to ${alternative.id}`);
      this.bus.publish(alternative.id, {
        type: 'failover',
        from: agentId,
        to: alternative.id,
        topic: 'agent_failover',
      });

      try {
        return await this.executeAgent(
          { id: alternative.id, skillId: alternative.skillId ?? undefined },
          { ...context, requiredCapability: capability, failoverFrom: agentId },
          { allowFailover: false },
        );
      } catch (error) {
        console.warn(
          `[Orchestrator] Failover candidate ${alternative.id} failed:`,
          error?.message || error,
        );
      }
    }

    console.error(`[Orchestrator] No alternative found for ${agentId}`);
    return null;
  }
}

const orchestrator = new SubAgentOrchestrator();
export default orchestrator;
