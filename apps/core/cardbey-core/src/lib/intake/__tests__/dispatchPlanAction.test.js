import { describe, expect, it } from 'vitest';
import { enrichClassificationWithMemoryPlan, planAction } from '../dispatchPlanAction.js';

describe('dispatchPlanAction', () => {
  it('prepends analyze_engagement for low_engagement + launch_campaign', async () => {
    const plan = await planAction({
      intentType: 'launch_campaign',
      storeId: 'store-1',
      memoryBundle: {
        business: { learnedSignals: ['low_engagement'] },
        session: { learnedSignals: [] },
      },
    });

    expect(plan.steps[0].action).toBe('analyze_engagement');
    expect(plan.steps[0].executable).toBe(false);
    expect(plan.steps[1]?.action).toBe('launch_campaign');
  });

  it('enriches proactive_plan classification with advisory steps', async () => {
    const enriched = await enrichClassificationWithMemoryPlan(
      {
        executionPath: 'proactive_plan',
        tool: 'launch_campaign',
        parameters: {},
        plan: [{ step: 1, title: 'Launch', recommendedTool: 'launch_campaign' }],
      },
      {
        storeId: 'store-1',
        memoryBundle: {
          business: { learnedSignals: ['low_engagement'] },
          session: { learnedSignals: [] },
        },
      },
    );

    expect(Array.isArray(enriched.plan)).toBe(true);
    expect(enriched.plan[0]?.recommendedTool).toBe('analyze_engagement');
    expect(enriched._memoryPlanReasoning?.length).toBeGreaterThan(0);
  });
});
