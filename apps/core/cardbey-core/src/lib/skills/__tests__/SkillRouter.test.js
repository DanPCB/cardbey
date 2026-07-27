import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SkillRegistry } from '../SkillRegistry.js';
import { SkillRouter } from '../SkillRouter.js';

const executeRuntimeAction = vi.fn();

vi.mock('../../runtime/performerRuntime/executeRuntimeAction.js', () => ({
  executeRuntimeAction: (...args) => executeRuntimeAction(...args),
}));

vi.mock('../../runtime/performerRuntime/runtimeAuthorityGuard.js', () => ({
  recordRuntimeAuthorityPathUsed: vi.fn(),
}));

describe('SkillRouter', () => {
  /** @type {SkillRegistry} */
  let registry;
  /** @type {SkillRouter} */
  let router;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new SkillRegistry();
    router = new SkillRouter({
      skillRegistry: registry,
      skillExecutor: { execute: vi.fn() },
    });
  });

  const skill = {
    name: 'router_skill',
    version: '1.0',
    description: 'test',
    triggers: ['launch_store'],
    requiredContext: ['storeId', 'userId'],
    steps: [{ id: 's1', name: 'S', tool: 'tool_a' }],
  };

  it('returns matched:false when no skill for intent', async () => {
    const result = await router.route('create_promotion', { storeId: 's', userId: 'u' });
    expect(result.matched).toBe(false);
    expect(result.dispatchedVia).toBe('tool');
  });

  it('returns matched:true and executes skill via runtime when trigger found', async () => {
    registry.register(skill);
    executeRuntimeAction.mockResolvedValue({
      status: 'ok',
      output: {
        skillExecution: {
          id: 'exec-1',
          skillName: 'router_skill',
          missionId: 'm-1',
          status: 'completed',
          currentStep: 1,
          stepResults: {},
          ctx: {},
          startedAt: new Date().toISOString(),
          canResume: false,
        },
      },
    });

    const result = await router.route('launch_store', {
      missionId: 'm-1',
      storeId: 'store-1',
      userId: 'user-1',
      toolInput: {},
    });

    expect(result.matched).toBe(true);
    expect(result.skillName).toBe('router_skill');
    expect(result.executionId).toBe('exec-1');
    expect(result.dispatchedVia).toBe('skill');
    expect(executeRuntimeAction).toHaveBeenCalledOnce();
    expect(executeRuntimeAction.mock.calls[0][0].actionType).toBe('run_skill');
  });

  it('returns MISSING_CONTEXT when requiredContext absent', async () => {
    registry.register(skill);
    const result = await router.route('launch_store', { missionId: 'm-1', userId: 'user-1' });
    expect(result.matched).toBe(true);
    expect(result.result?.reason).toBe('MISSING_CONTEXT');
    expect(result.result?.missing).toContain('storeId');
    expect(executeRuntimeAction).not.toHaveBeenCalled();
  });

  it('falls through gracefully on runtime error', async () => {
    registry.register(skill);
    executeRuntimeAction.mockRejectedValue(new Error('executor boom'));

    const result = await router.route('launch_store', {
      missionId: 'm-1',
      storeId: 'store-1',
      userId: 'user-1',
    });

    expect(result.matched).toBe(true);
    expect(result.result?.status).toBe('failed');
    expect(result.result?.failedReason).toContain('executor boom');
  });
});
