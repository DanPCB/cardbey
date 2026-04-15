import { describe, it, expect, afterEach } from 'vitest';

describe('missionPlanner env boundary (Phase 5)', () => {
  const prev = process.env.USE_LLM_TASK_PLANNER;

  afterEach(() => {
    if (prev === undefined) delete process.env.USE_LLM_TASK_PLANNER;
    else process.env.USE_LLM_TASK_PLANNER = prev;
  });

  it('returns null without calling LLM when USE_LLM_TASK_PLANNER is unset', async () => {
    delete process.env.USE_LLM_TASK_PLANNER;
    const { planMission } = await import('../services/react/missionPlanner.ts');
    let called = false;
    const gateway = {
      generate: async () => {
        called = true;
        return { text: '{}' };
      },
    };
    const plan = await planMission(
      'find suppliers and create a store for X',
      {},
      ['research', 'catalog'],
      gateway
    );
    expect(plan).toBeNull();
    expect(called).toBe(false);
  });
});
