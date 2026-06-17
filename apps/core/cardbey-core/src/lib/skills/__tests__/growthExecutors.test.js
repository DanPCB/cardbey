import { describe, it, expect } from 'vitest';
import { execute as auditLocalPresence } from '../../toolExecutors/growth/audit_local_presence.js';
import { execute as generateGrowthPlan } from '../../toolExecutors/growth/generate_growth_plan.js';
import { execute as monitorGrowthBaseline } from '../../toolExecutors/growth/monitor_growth_baseline.js';

describe('growth executors', () => {
  it('audit_local_presence returns scores, gaps, and topOpportunity', async () => {
    const result = await auditLocalPresence({ storeId: 'growth-store-1' });

    expect(result.status).toBe('ok');
    expect(result.output?.audit?.storeId).toBe('growth-store-1');
    expect(result.output?.audit?.scores).toMatchObject({
      profileCompleteness: expect.any(Number),
      contentFreshness: expect.any(Number),
      offerActivity: expect.any(Number),
      socialPresence: expect.any(Number),
      displayPresence: expect.any(Number),
    });
    expect(result.output?.audit?.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.output?.audit?.overallScore).toBeLessThanOrEqual(100);
    expect(Array.isArray(result.output?.audit?.gaps)).toBe(true);
    expect(result.output?.audit?.topOpportunity).toBeTruthy();
  });

  it('audit generates gap when any score is below 60', async () => {
    const result = await auditLocalPresence({ storeId: 'growth-store-1' });
    const scores = result.output?.audit?.scores ?? {};
    const gaps = result.output?.audit?.gaps ?? [];

    const hasLowScore = Object.values(scores).some((v) => v < 60);
    if (hasLowScore) {
      expect(gaps.length).toBeGreaterThan(0);
    } else {
      expect(gaps.length).toBe(0);
    }
  });

  it('generate_growth_plan returns ranked actions', async () => {
    const audit = {
      gaps: ['no active offer', 'low content freshness', 'no social links'],
      scores: { offerActivity: 30, contentFreshness: 40, socialPresence: 50 },
      overallScore: 45,
    };

    const result = await generateGrowthPlan({
      storeId: 'store-1',
      audit,
      goals: ['more_customers'],
    });

    expect(result.status).toBe('ok');
    expect(result.output?.plan?.actions?.length).toBeGreaterThan(0);
    expect(result.output?.plan?.actions?.[0]?.rank).toBe(1);
    expect(result.output?.plan?.topAction).toEqual(result.output?.plan?.actions?.[0]);
    expect(result.output?.plan?.actions?.every((a) => a.autoExecute === false)).toBe(true);
  });

  it('plan maps no active offer gap to offer_optimization skill', async () => {
    const result = await generateGrowthPlan({
      audit: { gaps: ['no active offer'] },
    });

    const action = result.output?.plan?.actions?.find((a) => a.gap === 'no active offer');
    expect(action?.skillToRun).toBe('offer_optimization');
    expect(action?.effort).toBe('low');
  });

  it('plan maps low content freshness to campaign skill', async () => {
    const result = await generateGrowthPlan({
      audit: { gaps: ['low content freshness'] },
    });

    const action = result.output?.plan?.actions?.find(
      (a) => a.gap === 'low content freshness',
    );
    expect(action?.skillToRun).toBe('campaign');
    expect(action?.effort).toBe('medium');
  });

  it('monitor_growth_baseline blocked until persistence is wired', async () => {
    const audit = {
      scores: { profileCompleteness: 70 },
      overallScore: 68,
    };

    const result = await monitorGrowthBaseline({
      storeId: 'store-1',
      audit,
      planId: 'plan-2024',
      actionTaken: null,
    });

    expect(result.status).toBe('blocked');
    expect(result.reason).toBe('not_persisted');
    expect(result.output?.partial?.baseline?.trackingId).toBeTruthy();
    expect(result.output?.partial?.baseline?.overallScore).toBe(68);
    expect(result.output?.partial?.baseline?.planId).toBe('plan-2024');

    const nextAudit = new Date(result.output.partial.baseline.nextAuditAt).getTime();
    const expectedMin = Date.now() + 29 * 24 * 60 * 60 * 1000;
    expect(nextAudit).toBeGreaterThan(expectedMin);
  });
});
