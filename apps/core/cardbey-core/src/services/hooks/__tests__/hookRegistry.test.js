import { describe, it, expect, beforeEach } from 'vitest';
import { HookRegistry, HOOK_TYPES, HOOK_PRIORITIES } from '../hookRegistry.js';
import { Hook } from '../hookTypes.js';
import { resetSkillMetricsForTests, getSkillMetrics } from '../hookMetrics.js';
import { HookExecutor } from '../hookExecutor.js';

describe('Composable HookRegistry', () => {
  /** @type {HookRegistry} */
  let registry;

  beforeEach(() => {
    registry = new HookRegistry();
    resetSkillMetricsForTests();
  });

  it('registers and retrieves hooks by type', () => {
    registry.register({
      id: 'test_hook',
      type: HOOK_TYPES.PRE_EXECUTION,
      name: 'Test Hook',
      handler: async () => ({ ok: true }),
    });
    const hooks = registry.getPreHooks();
    expect(hooks.some((h) => h.id === 'test_hook')).toBe(true);
  });

  it('sorts hooks by priority', () => {
    registry.register({
      id: 'hook_low',
      type: HOOK_TYPES.PRE_EXECUTION,
      priority: HOOK_PRIORITIES.LOW,
      handler: async () => ({}),
    });
    registry.register({
      id: 'hook_high',
      type: HOOK_TYPES.PRE_EXECUTION,
      priority: HOOK_PRIORITIES.HIGH,
      handler: async () => ({}),
    });
    const hooks = registry.getPreHooks();
    expect(hooks[0].id).toBe('hook_high');
    expect(hooks[1].id).toBe('hook_low');
  });

  it('unregisters hooks', () => {
    registry.register({
      id: 'temp_hook',
      type: HOOK_TYPES.PRE_EXECUTION,
      handler: async () => ({}),
    });
    expect(registry.unregister('temp_hook')).toBe(true);
    expect(registry.getPreHooks().some((h) => h.id === 'temp_hook')).toBe(false);
  });
});

describe('Hook', () => {
  it('skips when condition is false', async () => {
    const hook = new Hook({
      id: 'conditional',
      type: HOOK_TYPES.PRE_EXECUTION,
      condition: () => false,
      handler: async () => ({ ran: true }),
    });
    const result = await hook.execute({});
    expect(result.skipped).toBe(true);
  });

  it('times out slow handlers', async () => {
    const hook = new Hook({
      id: 'slow',
      type: HOOK_TYPES.PRE_EXECUTION,
      timeout: 20,
      handler: async () => {
        await new Promise((r) => setTimeout(r, 100));
        return { ok: true };
      },
    });
    await expect(hook.execute({})).rejects.toThrow('timed out');
  });
});

describe('HookExecutor', () => {
  /** @type {HookRegistry} */
  let registry;
  /** @type {HookExecutor} */
  let executor;

  beforeEach(() => {
    registry = new HookRegistry();
    executor = new HookExecutor(registry);
    resetSkillMetricsForTests();
  });

  it('executes post hooks and records metrics', async () => {
    registry.register({
      id: 'update_metrics',
      type: HOOK_TYPES.POST_EXECUTION,
      handler: async (ctx) => {
        const { recordSkillExecution } = await import('../hookMetrics.js');
        recordSkillExecution(ctx.skillId, ctx.userId, ctx.result?.duration ?? 0);
        return { metricsUpdated: true };
      },
    });

    await executor.executePostHooks('analyze_store', { userId: 'u1', skillId: 'analyze_store' }, {
      duration: 42,
    });

    expect(getSkillMetrics('analyze_store', 'u1')?.executions).toBe(1);
  });

  it('throws when critical hook fails', async () => {
    registry.register({
      id: 'critical_fail',
      type: HOOK_TYPES.PRE_EXECUTION,
      priority: HOOK_PRIORITIES.CRITICAL,
      handler: async () => {
        throw new Error('critical boom');
      },
    });

    await expect(executor.executePreHooks('test_skill', {})).rejects.toThrow('Critical hook');
  });

  it('runs error and rollback hooks without throwing on non-critical failures', async () => {
    const order = [];
    registry.register({
      id: 'err',
      type: HOOK_TYPES.ON_ERROR,
      priority: HOOK_PRIORITIES.LOW,
      handler: async () => {
        order.push('error');
      },
    });
    registry.register({
      id: 'rb',
      type: HOOK_TYPES.ON_ROLLBACK,
      priority: HOOK_PRIORITIES.LOW,
      handler: async () => {
        order.push('rollback');
      },
    });

    await executor.executeErrorHooks('demo', {}, new Error('boom'));
    await executor.executeRollbackHooks('demo', {}, new Error('boom'));
    expect(order).toEqual(['error', 'rollback']);
  });
});

describe('executeWithLifecycleHooks', () => {
  beforeEach(() => {
    resetSkillMetricsForTests();
  });

  it('runs pre and post hooks around executor', async () => {
    const { default: hookRegistry } = await import('../hookRegistry.js');
    const { executeWithLifecycleHooks } = await import('../lifecycleRunner.js');
    const order = [];

    hookRegistry.clear();
    hookRegistry.register({
      id: 'pre2',
      type: HOOK_TYPES.PRE_EXECUTION,
      handler: async () => {
        order.push('pre');
      },
    });
    hookRegistry.register({
      id: 'post2',
      type: HOOK_TYPES.POST_EXECUTION,
      handler: async () => {
        order.push('post');
      },
    });

    const result = await executeWithLifecycleHooks('demo_skill', { userId: 'u1' }, async () => {
      order.push('exec');
      return { ok: true };
    });

    expect(result.ok).toBe(true);
    expect(order).toEqual(['pre', 'exec', 'post']);
  });

  it('runs error and rollback hooks on failure', async () => {
    const { default: hookRegistry } = await import('../hookRegistry.js');
    const { executeWithLifecycleHooks } = await import('../lifecycleRunner.js');
    const order = [];

    hookRegistry.clear();
    hookRegistry.register({
      id: 'err',
      type: HOOK_TYPES.ON_ERROR,
      handler: async () => {
        order.push('error');
      },
    });
    hookRegistry.register({
      id: 'rb',
      type: HOOK_TYPES.ON_ROLLBACK,
      handler: async () => {
        order.push('rollback');
      },
    });

    await expect(
      executeWithLifecycleHooks('demo_skill', { userId: 'u1' }, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(order).toContain('error');
    expect(order).toContain('rollback');
  });
});
