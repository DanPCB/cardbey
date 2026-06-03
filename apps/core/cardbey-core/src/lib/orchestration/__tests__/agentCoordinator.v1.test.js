import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AgentCoordinator } from '../agentCoordinator.js';
import {
  loadAgentClass,
  preloadCoordinatorAgents,
  clearAgentClassCacheForTests,
  AGENT_MODULE_MAP,
} from '../agentLoader.js';
import { __clearRuntimeStoresForTests } from '../../../orchestrator/memory/runtimeMemory.js';

describe('orchestration agents V1', () => {
  beforeEach(() => {
    clearAgentClassCacheForTests();
    __clearRuntimeStoresForTests();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('loads all coordinator-required agent classes', async () => {
    await preloadCoordinatorAgents();
    for (const type of Object.keys(AGENT_MODULE_MAP)) {
      if (type === 'catalog' || type === 'media') continue;
      const Cls = await loadAgentClass(type);
      expect(Cls).toBeTruthy();
      const agent = new Cls({ context: { missionId: 'm-test' } });
      expect(typeof agent.execute).toBe('function');
    }
  });

  it('falls back safely when agent module path is invalid', async () => {
    const original = AGENT_MODULE_MAP.research;
    AGENT_MODULE_MAP.research = { path: './agents/__missing_module__.js', exportName: 'ResearchAgent' };
    clearAgentClassCacheForTests();
    try {
      const Cls = await loadAgentClass('research');
      const out = await new Cls({ context: {} }).execute({
        taskId: 't1',
        agentType: 'research',
        description: 'x',
      });
      expect(out.summary).toMatch(/stub/i);
      expect(out.result?.stub).toBe(true);
    } finally {
      AGENT_MODULE_MAP.research = original;
      clearAgentClassCacheForTests();
    }
  });

  it('AgentCoordinator.orchestrate does not throw without LLM keys', async () => {
    const prevAnthropic = process.env.ANTHROPIC_API_KEY;
    const prevOpenai = process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const coordinator = new AgentCoordinator({
      missionId: 'mission-test-orchestrate',
      orchestrationKind: 'default',
      baseContext: { missionId: 'mission-test-orchestrate', storeId: 'temp' },
    });

    const results = await coordinator.orchestrate('Create mini website: test bakery', {});
    expect(results).toBeTypeOf('object');

    if (prevAnthropic !== undefined) process.env.ANTHROPIC_API_KEY = prevAnthropic;
    if (prevOpenai !== undefined) process.env.OPENAI_API_KEY = prevOpenai;
  });

  it('build agent stub exposes structured_store_build compatible shape', async () => {
    const Build = await loadAgentClass('build');
    const out = await new Build({
      context: { missionId: 'm1', businessName: 'My Bakery' },
    }).execute({ taskId: 'b1', agentType: 'build', goal: 'My Bakery' });
    expect(out.result?.structured_store_build?.stub).toBe(true);
    expect(out.result?.structured_store_build?.businessName).toBe('My Bakery');
  });
});
