/**
 * get_store_analytics — read-only store performance aggregates (Round 3).
 * DANH: skill-round3-analytics
 *
 * Phase 3 (multi-agent): also emit markdown + optional mission blackboard event
 * so SkillExecutionResultCard / MultiAgentMissionCard can surface the report.
 */

import { getPrismaClient } from '../prisma.js';
import { appendEvent } from '../missionBlackboard.js';
import { buildReportSummary, formatAnalyticsReportMarkdown } from './generate_report_summary.js';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export { formatAnalyticsReportMarkdown } from './generate_report_summary.js';

/**
 * @param {object} [input]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  const storeId =
    (typeof input?.storeId === 'string' && input.storeId.trim()) ||
    (typeof context?.storeId === 'string' && context.storeId.trim()) ||
    null;

  if (!storeId) {
    return {
      status: 'failed',
      error: { code: 'VALIDATION_ERROR', message: 'storeId is required' },
      output: { ok: false, error: 'storeId is required' },
    };
  }

  const prisma = getPrismaClient();
  const since = new Date(Date.now() - THIRTY_DAYS_MS);
  const missionId =
    (typeof input?.missionId === 'string' && input.missionId.trim()) ||
    (typeof context?.missionId === 'string' && context.missionId.trim()) ||
    null;

  try {
    const business = await prisma.business.findFirst({
      where: { id: storeId },
      select: { slug: true, updatedAt: true, name: true },
    });

    if (!business) {
      return {
        status: 'failed',
        error: { code: 'NOT_FOUND', message: 'Store not found' },
        output: { ok: false, error: 'store_not_found' },
      };
    }

    const [bookingCount, productCount, activePromos, promoAgg, productViews] = await Promise.all([
      prisma.booking?.count
        ? prisma.booking.count({
            where: { storeId, createdAt: { gte: since } },
          })
        : Promise.resolve(0),
      prisma.product.count({
        where: { businessId: storeId, deletedAt: null },
      }),
      prisma.storePromo.count({
        where: { storeId, isActive: true },
      }),
      prisma.storePromo.aggregate({
        where: { storeId, isActive: true },
        _sum: { scanCount: true },
      }),
      prisma.product.aggregate({
        where: { businessId: storeId, deletedAt: null },
        _sum: { viewCount: true },
      }),
    ]);

    const daysSinceUpdate = business.updatedAt
      ? Math.floor((Date.now() - new Date(business.updatedAt).getTime()) / (24 * 60 * 60 * 1000))
      : null;

    const analytics = {
      storeId,
      storeSlug: business.slug,
      storeName: business.name,
      bookingCount,
      productCount,
      activePromos,
      campaignReach: promoAgg._sum.scanCount ?? 0,
      productViews: productViews._sum.viewCount ?? 0,
      daysSinceUpdate,
      windowDays: 30,
      aggregatedAt: new Date().toISOString(),
    };

    const summary = buildReportSummary(analytics);
    const content = formatAnalyticsReportMarkdown(analytics, summary);

    if (missionId) {
      void appendEvent(missionId, 'skill:analytics_report', {
        type: 'analytics_report',
        title: 'Store Performance Report',
        format: 'markdown',
        content,
        analytics,
        summary,
      }).catch(() => {});
    }

    // Side effect: read-only DB aggregate across Booking, Product, StorePromo, Business.
    return {
      status: 'ok',
      type: 'analytics_report',
      content,
      output: {
        ok: true,
        analytics,
        summary,
        type: 'analytics_report',
        title: 'Store Performance Report',
        format: 'markdown',
        content,
      },
    };
  } catch (err) {
    return {
      status: 'failed',
      error: { message: err?.message ?? String(err) },
      output: { ok: false },
    };
  }
}

export default execute;
