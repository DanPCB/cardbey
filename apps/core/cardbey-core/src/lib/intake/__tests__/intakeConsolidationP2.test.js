import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  isExecuteIntentShadowEnabled,
  isReactPlannerPostClassifyEnabled,
  scheduleExecuteIntentShadow,
} from '../intakeConsolidationFlags.js';
import {
  buildIntakeReactPlannerRegistry,
  isReactPlannerConfirmDecision,
  mergePlannerParameters,
  runPostClassifyReactPlanner,
} from '../reactPlannerBridge.js';

describe('intakeConsolidationFlags', () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
  });

  it('defaults executeIntent shadow to disabled', () => {
    delete process.env.EXECUTE_INTENT_SHADOW;
    expect(isExecuteIntentShadowEnabled()).toBe(false);
    process.env.EXECUTE_INTENT_SHADOW = 'true';
    expect(isExecuteIntentShadowEnabled()).toBe(true);
  });

  it('defaults react planner post-classify to enabled', () => {
    delete process.env.ENABLE_REACT_PLANNER_POST_CLASSIFY;
    expect(isReactPlannerPostClassifyEnabled()).toBe(true);
    process.env.ENABLE_REACT_PLANNER_POST_CLASSIFY = 'false';
    expect(isReactPlannerPostClassifyEnabled()).toBe(false);
  });

  it('scheduleExecuteIntentShadow no-ops when shadow disabled', async () => {
    process.env.EXECUTE_INTENT_SHADOW = 'false';
    const spy = vi.fn();
    vi.doMock('../orchestrator/executeIntent.js', () => ({
      executeIntent: spy,
    }));
    scheduleExecuteIntentShadow({ source: 'test', rawInput: 'hello' });
    await new Promise((r) => setImmediate(r));
    expect(spy).not.toHaveBeenCalled();
    vi.doUnmock('../orchestrator/executeIntent.js');
  });
});

describe('reactPlannerBridge confirm', () => {
  it('detects confirm decisions', () => {
    expect(isReactPlannerConfirmDecision({ kind: 'confirm', toolName: 'create_promotion' })).toBe(true);
    expect(isReactPlannerConfirmDecision({ kind: 'ask', prompt: 'x' })).toBe(false);
  });

  it('merges planner parameters over classification parameters', () => {
    const merged = mergePlannerParameters(
      { parameters: { storeId: 's1', campaignContext: 'spring' } },
      { kind: 'confirm', toolName: 'create_promotion', parameters: { productId: 'p1' } },
    );
    expect(merged).toEqual({ storeId: 's1', campaignContext: 'spring', productId: 'p1' });
  });

  it('returns confirm for approval-required tools with store context', async () => {
    const out = await runPostClassifyReactPlanner({
      userMessage: 'create a promotion for my spring sale',
      classification: {
        executionPath: 'proactive_plan',
        tool: 'create_promotion',
        confidence: 0.95,
        parameters: { storeId: 'store-1', campaignContext: 'spring sale' },
      },
      context: { storeId: 'store-1' },
      hydratedContext: {
        message: 'create a promotion for my spring sale',
        entities: { store: { id: 'store-1', name: 'Bakery', slug: null } },
        episodic: [],
        working: {},
        resolution: { errors: [] },
      },
    });
    expect(out?.kind).toBe('confirm');
    expect(out?.toolName).toBe('create_promotion');
    expect(buildIntakeReactPlannerRegistry().find((t) => t.toolName === 'create_promotion')?.approvalRequired).toBe(
      true,
    );
  });
});
