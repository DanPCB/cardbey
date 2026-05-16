/**
 * GET /api/admin/metrics/live - live dashboard metrics
 * Admin auth required.
 */
import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { getPrismaClient } from '../lib/prisma.js';

const router = Router();
router.use(requireAuth);
router.use(requireAdmin);

function getTodayAndYesterday() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return { today, yesterday: yesterday.toISOString().slice(0, 10) };
}

router.get('/metrics/live', async (req, res) => {
  try {
    const prisma = getPrismaClient();
    const { today, yesterday } = getTodayAndYesterday();
    const missionTodayCount = await prisma.missionPipeline?.count({ where: { createdAt: { gte: new Date(today) } } }).catch(() => 0);
    const missionYesterdayCount = await prisma.missionPipeline?.count({ where: { createdAt: { gte: new Date(yesterday), lt: new Date(today) } } }).catch(() => 0);
    const missionCompletedToday = await prisma.missionPipeline?.count({ where: { status: 'completed', completedAt: { gte: new Date(today) } } }).catch(() => 0);
    const missionFailedToday = await prisma.missionPipeline?.count({ where: { status: 'failed', failedAt: { gte: new Date(today) } } }).catch(() => 0);
    const llmToday = await prisma.llmUsageDaily?.aggregate({ where: { day: today }, _count: true }).catch(() => ({ _count: 0 }));
    const llmYesterday = await prisma.llmUsageDaily?.aggregate({ where: { day: yesterday }, _count: true }).catch(() => ({ _count: 0 }));
    const activeCampaigns = await prisma.promotion?.count({ where: { status: 'active' } }).catch(() => 0) ?? 0;
    const llmCallsToday = llmToday?._count ?? 0;
    const llmCallsYesterday = llmYesterday?._count ?? 0;
    res.json({
      ok: true,
      activeCampaigns,
      caiEarned: 0,
      totalReach: 0,
      conversionRate: 0,
      shares: 0,
      deltas: { activeCampaigns: 0, caiEarned: 0, totalReach: 0, conversionRate: 0, shares: 0, missions: (missionTodayCount ?? 0) - (missionYesterdayCount ?? 0), llmCalls: llmCallsToday - llmCallsYesterday },
      missionsToday: missionTodayCount ?? 0,
      completedToday: missionCompletedToday ?? 0,
      failedToday: missionFailedToday ?? 0,
      llmCallsToday,
    });
  } catch (e) {
    console.error('[admin/metrics/live]', e);
    res.status(500).json({ ok: false, error: e?.message ?? 'Failed to load metrics' });
  }
});

export default router;
