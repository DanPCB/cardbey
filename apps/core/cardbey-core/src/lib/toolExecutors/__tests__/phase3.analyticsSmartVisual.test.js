/**
 * @vitest-environment node
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { buildReportSummary, formatAnalyticsReportMarkdown } from '../generate_report_summary.js';
import * as generate_report_summary from '../generate_report_summary.js';

describe('analytics report output (Phase 3)', () => {
  it('buildReportSummary produces strengths/gaps/topAction', () => {
    const summary = buildReportSummary({
      bookingCount: 0,
      productCount: 2,
      activePromos: 0,
      campaignReach: 0,
      productViews: 0,
      windowDays: 30,
    });
    expect(summary.gaps.length).toBeGreaterThan(0);
    expect(summary.topAction).toBeTruthy();
  });

  it('formatAnalyticsReportMarkdown includes title and snapshot', () => {
    const analytics = {
      storeName: 'Test Cafe',
      storeId: 's1',
      bookingCount: 3,
      productCount: 10,
      activePromos: 1,
      campaignReach: 12,
      productViews: 40,
      windowDays: 30,
    };
    const summary = buildReportSummary(analytics);
    const md = formatAnalyticsReportMarkdown(analytics, summary);
    expect(md).toContain('Store Performance Report');
    expect(md).toContain('Test Cafe');
    expect(md).toContain('## Snapshot');
  });

  it('generate_report_summary execute returns type analytics_report with content', async () => {
    const result = await generate_report_summary.execute({
      analytics: {
        storeName: 'Test Cafe',
        bookingCount: 1,
        productCount: 5,
        activePromos: 1,
        campaignReach: 0,
        productViews: 0,
        windowDays: 30,
      },
    });
    expect(result.status).toBe('ok');
    expect(result.type).toBe('analytics_report');
    expect(result.content).toContain('Store Performance Report');
    expect(result.output?.format).toBe('markdown');
  });
});

describe('smart_visual forceNew (Phase 3)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls createPromotionGraphic with forceNew and ai-first by default', async () => {
    const createPromotionGraphic = vi.fn(async () => ({
      promotionId: 'promo-a',
      instanceId: 'inst-a',
      graphicUrl: 'https://example.com/a.png',
      copy: { headline: 'Hello' },
    }));

    vi.doMock('../../../services/promotionGraphic/promotionGraphicService.js', () => ({
      createPromotionGraphic,
    }));
    vi.doMock('../../missionBlackboard.js', () => ({
      appendEvent: vi.fn(async () => ({})),
    }));

    const { execute } = await import('../design/smart_visual.js');
    const result = await execute(
      { prompt: 'Summer promo', storeId: 'store-1' },
      { userId: 'user-1', missionId: 'mission-1' },
    );

    expect(createPromotionGraphic).toHaveBeenCalledTimes(1);
    expect(createPromotionGraphic.mock.calls[0][0].forceNew).toBe(true);
    expect(createPromotionGraphic.mock.calls[0][0].imagePrefer).toBe('ai-first');
    expect(result.output.instanceId).toBe('inst-a');
    expect(result.type).toBe('promotion_asset');
  });

  it('second call yields a different instanceId when service returns new ids', async () => {
    let n = 0;
    const createPromotionGraphic = vi.fn(async () => {
      n += 1;
      return {
        promotionId: `promo-${n}`,
        instanceId: `inst-${n}`,
        graphicUrl: `https://example.com/${n}.png`,
        copy: { headline: `H${n}` },
      };
    });

    vi.doMock('../../../services/promotionGraphic/promotionGraphicService.js', () => ({
      createPromotionGraphic,
    }));
    vi.doMock('../../missionBlackboard.js', () => ({
      appendEvent: vi.fn(async () => ({})),
    }));

    const { execute } = await import('../design/smart_visual.js');
    const a = await execute(
      { prompt: 'Summer promo', storeId: 'store-1' },
      { userId: 'user-1' },
    );
    const b = await execute(
      { prompt: 'Summer promo', storeId: 'store-1' },
      { userId: 'user-1' },
    );
    expect(a.output.instanceId).not.toBe(b.output.instanceId);
  });
});
