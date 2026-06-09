// DANH: skill-runtime-phase6
/**
 * Phase 6 tests — output chaining, analytics_report pattern, registry wiring.
 */

import { describe, it, expect, vi } from 'vitest';
import { wrapChainedSteps } from '../stepAdapter.js';
import { analyticsReportSteps, storeHealthSteps } from '../executorFactories.js';
import { IntentDisambiguator } from '../intent_disambiguator.js';
import {
  analyticsReportPattern,
  storeHealthPattern,
  ANALYTICS_REPORT_INTENT,
  STORE_HEALTH_INTENT,
  CARDBEY_INTENT_PATTERNS,
} from '../patterns.js';
import { runtimeRegistry } from '../runtimeRegistry.js';
import type { SkillContext } from '../types.js';

function ctx(query: string, extra: Partial<SkillContext> = {}): SkillContext {
  return {
    query,
    userId: 'user-1',
    conversationId: 'conv-1',
    userHasProducts: false,
    existingSegments: [],
    metadata: { storeId: 'store-1' },
    ...extra,
  };
}

describe('wrapChainedSteps — output chaining', () => {
  it('step 2 receives step 1 accumulated output', async () => {
    const step2Fn = vi.fn(async (input: Record<string, unknown>) => ({ received: input.analyticsData }));
    const steps = wrapChainedSteps([
      {
        id: 'step1',
        name: 'Step one',
        fn: async () => ({ analyticsData: 'x' }),
        toAccumulator: (output) => output as Record<string, unknown>,
      },
      {
        id: 'step2',
        name: 'Step two',
        fn: step2Fn,
      },
    ]);

    await steps[0].execute(ctx('q'), 'running');
    await steps[1].execute(ctx('q'), 'running');

    expect(step2Fn).toHaveBeenCalledTimes(1);
    expect(step2Fn.mock.calls[0][0].analyticsData).toBe('x');
  });

  it('separate wrapChainedSteps calls have isolated accumulators', async () => {
    const seen: string[] = [];
    const makeChain = (tag: string) =>
      wrapChainedSteps([
        {
          id: 'a',
          name: 'A',
          fn: async () => {
            seen.push(tag);
            return { tag };
          },
          toAccumulator: (output) => output as Record<string, unknown>,
        },
        {
          id: 'b',
          name: 'B',
          fn: async (input) => ({ prior: input.tag ?? null }),
        },
      ]);

    const chain1 = makeChain('first');
    const chain2 = makeChain('second');

    await chain1[0].execute(ctx('q'), 'running');
    const r1b = await chain1[1].execute(ctx('q'), 'running');
    await chain2[0].execute(ctx('q'), 'running');
    const r2b = await chain2[1].execute(ctx('q'), 'running');

    expect((r1b as { output: { prior: string | null } }).output.prior).toBe('first');
    expect((r2b as { output: { prior: string | null } }).output.prior).toBe('second');
    expect(seen).toEqual(['first', 'second']);
  });

  it('step 2 failure does not corrupt the accumulator', async () => {
    const step2Fn = vi.fn(async () => {
      throw new Error('step2 boom');
    });
    const steps = wrapChainedSteps([
      {
        id: 'step1',
        name: 'Step one',
        fn: async () => ({ keep: 'yes' }),
        toAccumulator: (output) => output as Record<string, unknown>,
      },
      {
        id: 'step2',
        name: 'Step two',
        fn: step2Fn,
      },
      {
        id: 'step3',
        name: 'Step three',
        fn: async (input) => ({ stillHas: input.keep }),
      },
    ]);

    await steps[0].execute(ctx('q'), 'running');
    const r2 = await steps[1].execute(ctx('q'), 'running');
    const r3 = await steps[2].execute(ctx('q'), 'running');

    expect(r2).toMatchObject({ status: 'failed', error: 'step2 boom' });
    expect((r3 as { output: { stillHas: string } }).output.stillHas).toBe('yes');
  });
});

describe('analytics_report pattern', () => {
  const d = new IntentDisambiguator();
  for (const p of CARDBEY_INTENT_PATTERNS) d.register(p);

  it('"How is my store performing" → analytics_report (≥0.65)', async () => {
    const resolved = await d.resolve(ctx('How is my store performing', { userHasProducts: true }));
    expect(resolved?.intent).toBe(ANALYTICS_REPORT_INTENT);
    const score = await analyticsReportPattern.matches(ctx('How is my store performing'));
    expect(score).toBeGreaterThanOrEqual(0.65);
  });

  it('"Store stats for last month" → analytics_report (≥0.65)', async () => {
    const resolved = await d.resolve(ctx('Store stats for last month'));
    expect(resolved?.intent).toBe(ANALYTICS_REPORT_INTENT);
    const score = await analyticsReportPattern.matches(ctx('Store stats for last month'));
    expect(score).toBeGreaterThanOrEqual(0.65);
  });

  it('"Audit my store" → store_health, not analytics_report', async () => {
    const resolved = await d.resolve(ctx('Audit my store'));
    expect(resolved?.intent).toBe(STORE_HEALTH_INTENT);
    expect(resolved?.intent).not.toBe(ANALYTICS_REPORT_INTENT);
    const healthScore = await storeHealthPattern.matches(ctx('Audit my store'));
    expect(healthScore).toBeGreaterThanOrEqual(0.65);
  });
});

describe('registry wiring — analytics_report', () => {
  it('dispatches "How is my store performing" with 2 chained steps', async () => {
    const skill = await runtimeRegistry.dispatch(
      ctx('How is my store performing', { userHasProducts: true })
    );
    expect(skill).not.toBeNull();
    expect(skill?.steps).toHaveLength(2);
    expect(skill?.steps[0].id).toBe('store_analytics');
    expect(skill?.steps[1].id).toBe('report_summary');
    expect(skill?.steps[0].name).toBe('Get store analytics');
    expect(skill?.steps[1].name).toBe('Generate report summary');
  });
});

describe('chained factories — step shape', () => {
  it('analyticsReportSteps returns 2 chained steps', () => {
    const steps = analyticsReportSteps();
    expect(steps).toHaveLength(2);
    expect(steps.map((s) => s.id)).toEqual(['store_analytics', 'report_summary']);
  });

  it('storeHealthSteps returns 2 chained steps', () => {
    const steps = storeHealthSteps();
    expect(steps).toHaveLength(2);
    expect(steps.map((s) => s.id)).toEqual(['audit_completeness', 'health_report']);
  });
});
