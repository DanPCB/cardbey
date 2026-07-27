import { describe, it, expect, beforeEach } from 'vitest';
import { SkillRegistry } from '../skillRegistry.js';
import { CompositionEngine } from '../compositionEngine.js';
import { SkillTestHarness } from '../skillTestHarness.js';

describe('CompositionEngine', () => {
  /** @type {SkillRegistry} */
  let registry;
  /** @type {CompositionEngine} */
  let engine;

  beforeEach(() => {
    registry = new SkillRegistry();
    registry.register({
      id: 'step_a',
      version: '1.0.0',
      steps: [{ action: 'tool_a' }],
    });
    registry.register({
      id: 'step_b',
      version: '1.0.0',
      steps: [{ action: 'tool_b' }],
    });
    registry.register({
      id: 'primary',
      version: '1.0.0',
      steps: [{ action: 'fail_tool' }],
      fallback: 'fallback_skill',
    });
    registry.register({
      id: 'fallback_skill',
      version: '1.0.0',
      steps: [{ action: 'fallback_tool' }],
    });

    engine = new CompositionEngine({
      registry,
      toolDispatcher: async (tool) => {
        if (tool === 'fail_tool') throw new Error('primary failed');
        if (tool === 'tool_a') return { output: { a: 1 } };
        if (tool === 'tool_b') return { output: { b: 2 } };
        if (tool === 'fallback_tool') return { output: { fallback: true } };
        return { output: {} };
      },
    });
  });

  it('executes skills in sequence and merges context', async () => {
    const { results, context } = await engine.sequence(
      [{ id: 'step_a' }, { id: 'step_b' }],
      { storeId: 's1' },
    );
    expect(results).toHaveLength(2);
    expect(context.a).toBe(1);
    expect(context.b).toBe(2);
    expect(context.storeId).toBe('s1');
  });

  it('executes skills in parallel', async () => {
    const { results } = await engine.parallel([{ id: 'step_a' }, { id: 'step_b' }], {});
    expect(results).toHaveLength(2);
    expect(results[0].skill).toBe('step_a');
    expect(results[1].skill).toBe('step_b');
  });

  it('runs conditional branch', async () => {
    const onTrue = await engine.condition(true, { id: 'step_a' }, { id: 'step_b' }, {});
    expect(onTrue.skill).toBe('step_a');

    const onFalse = await engine.condition(false, { id: 'step_a' }, { id: 'step_b' }, {});
    expect(onFalse.skill).toBe('step_b');
  });

  it('uses fallback when primary skill step fails', async () => {
    const result = await engine.executeSkill({ id: 'primary' }, {});
    expect(result.skill).toBe('fallback_skill');
    expect(result.output.data.fallback).toBe(true);
  });

  it('marks runtime authority on tool dispatch context', async () => {
    const dispatched = [];
    registry.register({
      id: 'auth_skill',
      version: '1.0.0',
      steps: [{ action: 'diagnose_store' }],
    });

    const authEngine = new CompositionEngine({
      registry,
      toolDispatcher: async (tool, input, context) => {
        dispatched.push({ tool, context });
        return { output: { ok: true, input } };
      },
    });

    await authEngine.executeSkill({ id: 'auth_skill' }, { storeId: 'store-1' });

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].tool).toBe('diagnose_store');
    expect(dispatched[0].context.runtimeOwned).toBe(true);
    expect(dispatched[0].context.performerRuntimeOwned).toBe(true);
    expect(dispatched[0].context.source).toMatch(/^composable_skill/);
  });
});

describe('SkillTestHarness', () => {
  it('runs skill with mocked tools in isolation', async () => {
    const registry = new SkillRegistry();
    registry.register({
      id: 'harness_skill',
      version: '1.0.0',
      steps: [{ action: 'mock_action' }],
    });

    const harness = new SkillTestHarness(registry);
    harness.mockTool('mock_action', async () => ({ output: { value: 42 } }));

    const result = await harness.run('harness_skill', { input: 'x' });
    expect(result.output.data.value).toBe(42);
  });
});
