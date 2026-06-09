// DANH: skill-round3-analytics
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execute as getStoreAnalytics } from '../../lib/toolExecutors/get_store_analytics.js';
import {
  buildReportSummary,
  execute as generateReportSummary,
} from '../../lib/toolExecutors/generate_report_summary.js';
import * as prismaModule from '../../lib/prisma.js';

describe('analytics executors', () => {
  beforeEach(() => {
    vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
      business: {
        findFirst: vi.fn().mockResolvedValue({
          slug: 'my-cafe',
          name: 'My Cafe',
          updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        }),
      },
      booking: { count: vi.fn().mockResolvedValue(4) },
      product: {
        count: vi.fn().mockResolvedValue(12),
        aggregate: vi.fn().mockResolvedValue({ _sum: { viewCount: 80 } }),
      },
      storePromo: {
        count: vi.fn().mockResolvedValue(2),
        aggregate: vi.fn().mockResolvedValue({ _sum: { scanCount: 25 } }),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('get_store_analytics returns aggregate fields', async () => {
    const result = await getStoreAnalytics({ storeId: 'store-1' });
    expect(result.status).toBe('ok');
    expect(result.output.analytics).toMatchObject({
      bookingCount: 4,
      productCount: 12,
      activePromos: 2,
      storeSlug: 'my-cafe',
    });
    expect(result.output.analytics.daysSinceUpdate).toBeGreaterThanOrEqual(2);
  });

  it('get_store_analytics fails without storeId', async () => {
    const result = await getStoreAnalytics({});
    expect(result.status).toBe('failed');
  });

  it('get_store_analytics fails when store not found', async () => {
    prismaModule.getPrismaClient().business.findFirst.mockResolvedValue(null);
    const result = await getStoreAnalytics({ storeId: 'missing' });
    expect(result.status).toBe('failed');
    expect(result.output.error).toBe('store_not_found');
  });

  it('generate_report_summary produces strengths and gaps', async () => {
    const summary = buildReportSummary({
      bookingCount: 3,
      productCount: 8,
      activePromos: 1,
      campaignReach: 20,
      productViews: 50,
      daysSinceUpdate: 2,
      windowDays: 30,
    });
    expect(summary.strengths.length).toBeGreaterThan(0);
    expect(summary.topAction).toBeTruthy();
  });

  it('generate_report_summary flags empty catalog gap', async () => {
    const summary = buildReportSummary({ bookingCount: 0, productCount: 0, activePromos: 0 });
    expect(summary.gaps.some((g) => /empty|Catalog/i.test(g))).toBe(true);
    expect(summary.topAction).toMatch(/first product/i);
  });

  it('generate_report_summary executor returns ok output', async () => {
    const result = await generateReportSummary({
      analytics: { bookingCount: 1, productCount: 2, activePromos: 0, windowDays: 30 },
    });
    expect(result.status).toBe('ok');
    expect(result.output.strengths).toBeInstanceOf(Array);
    expect(result.output.gaps).toBeInstanceOf(Array);
  });
});
