// DANH: skill-round3-analytics
import { describe, it, expect } from 'vitest';
import { skillRegistry } from '../../lib/skills/SkillRegistry.js';
import { AnalyticsReportSkill } from '../../lib/skills/definitions/AnalyticsReportSkill.js';
import { execute as getStoreAnalytics } from '../../lib/toolExecutors/get_store_analytics.js';

function matchesTrigger(intent) {
  return skillRegistry.findByTrigger(intent)?.name === 'analytics_report';
}

describe('AnalyticsReportSkill', () => {
  it('matches primary trigger analytics', () => {
    expect(matchesTrigger('analytics')).toBe(true);
  });

  it('does not match unrelated intent', () => {
    expect(matchesTrigger('book_appointment')).toBe(false);
  });

  it('has non-empty step list with required tools', () => {
    expect(AnalyticsReportSkill.steps.length).toBeGreaterThan(0);
    expect(AnalyticsReportSkill.steps.map((s) => s.tool)).toEqual([
      'get_store_analytics',
      'generate_report_summary',
    ]);
  });

  it('documents requiredContext storeId and userId', () => {
    expect(AnalyticsReportSkill.requiredContext).toContain('storeId');
    expect(AnalyticsReportSkill.requiredContext).toContain('userId');
  });

  it('summarise step receives analytics from prior step', () => {
    const build = AnalyticsReportSkill.steps[1].buildInput;
    const input = build?.(
      { storeId: 's1' },
      { get_analytics: { output: { analytics: { bookingCount: 2, productCount: 5 } } } },
    );
    expect(input?.analytics?.bookingCount).toBe(2);
  });

  it('missing storeId fails gracefully on analytics executor', async () => {
    const result = await getStoreAnalytics({}, {});
    expect(result.status).toBe('failed');
    expect(result.output?.error).toBe('storeId is required');
  });
});
