import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentRegistry } from '../agentRegistry.js';
import { MessageBus } from '../messageBus.js';
import { AgentSharedMemory } from '../agentSharedMemory.js';
import { AgentLifecycle } from '../agentLifecycle.js';
import { SubAgentOrchestrator } from '../orchestrator.js';

describe('SubAgentOrchestrator', () => {
  /** @type {AgentRegistry} */
  let registry;
  /** @type {MessageBus} */
  let bus;
  /** @type {AgentSharedMemory} */
  let sharedMemory;
  /** @type {SubAgentOrchestrator} */
  let orchestrator;

  beforeEach(() => {
    registry = new AgentRegistry();
    bus = new MessageBus();
    sharedMemory = new AgentSharedMemory();

    sharedMemory.loadBundle = vi.fn(async () => ({
      business: null,
      suitcase: [],
      user: null,
      session: { learnedSignals: [], recentTypes: [], sessionId: 'sess-1' },
      mission: null,
      meta: { fetchedAt: new Date().toISOString(), sources: [], partial: false, fetchDurationMs: 1 },
    }));

    orchestrator = new SubAgentOrchestrator({
      registry,
      bus,
      sharedMemory,
      lifecycle: new AgentLifecycle({ registry, bus }),
      skillExecutor: vi.fn(async (skillId, context) => ({
        skillId,
        output: { success: true, context },
      })),
    });

    for (const agent of [
      { id: 'analytics_agent', name: 'Analytics', capabilities: ['analyze'] },
      { id: 'creative_agent', name: 'Creative', capabilities: ['generate'] },
      { id: 'analytics_backup', name: 'Analytics Backup', capabilities: ['analyze'] },
    ]) {
      registry.register({
        ...agent,
        handler: async (context) => ({ agent: agent.id, ok: true, context }),
      });
      registry.setStatus(agent.id, 'active');
      registry.updateHealth(agent.id, { status: 'healthy' });
    }
  });

  it('executes agents in parallel', async () => {
    const result = await orchestrator.parallel(
      [{ id: 'analytics_agent' }, { id: 'creative_agent' }],
      { storeId: 'store-1' },
    );

    expect(result.successCount).toBe(2);
    expect(result.failureCount).toBe(0);
    expect(result.results.every((entry) => entry.status === 'fulfilled')).toBe(true);
  });

  it('chains agents with handoff messages', async () => {
    const handoffMessages = [];
    bus.subscribe('creative_agent', (message) => {
      if (message.type === 'handoff') handoffMessages.push(message);
    });

    const result = await orchestrator.chain(
      [{ id: 'analytics_agent' }, { id: 'creative_agent' }],
      { storeId: 'store-1' },
    );

    expect(result.chainResults).toHaveLength(2);
    expect(result.finalResult?.agent).toBe('creative_agent');
    expect(handoffMessages).toHaveLength(1);
    expect(handoffMessages[0].from).toBe('analytics_agent');
  });

  it('delegates to best agent for capability', async () => {
    const result = await orchestrator.delegate('analyze', { storeId: 'store-1' });
    expect(result.agent).toBe('analytics_agent');
    expect(result.ok).toBe(true);
  });

  it('fails over to alternate agent when primary is unhealthy', async () => {
    registry.updateHealth('analytics_agent', {
      status: 'unhealthy',
      updatedAt: new Date(Date.now() - 120_000),
    });

    const result = await orchestrator.executeAgent(
      { id: 'analytics_agent' },
      { requiredCapability: 'analyze', storeId: 'store-1' },
    );

    expect(result.agent).toBe('analytics_backup');
  });

  it('records shared memory between chained agents', async () => {
    const result = await orchestrator.chain([{ id: 'analytics_agent' }, { id: 'creative_agent' }], {
      storeId: 'store-1',
    });

    expect(result.sharedMemory.patches.analytics_agent).toBeTruthy();
    expect(sharedMemory.loadBundle).toHaveBeenCalled();
  });
});
