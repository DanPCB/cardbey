/**
 * GET /api/admin/pipeline/live - current running mission + steps + consensus
 * GET /api/admin/pipeline/stats - success rate, avg duration, counts, LLM cap
 * Admin auth required.
 */
import { Router } from 'express';
import { requireAuth, requireAdmin } from '../../middleware/auth.js';
import { getPrismaClient } from '../../lib/prisma.js';

const router = Router();

router.use(requireAuth);
router.use(requireAdmin);

router.get('/pipeline/live', async (req, res) => {
  try {
    const prisma = getPrismaClient();
    const running = await prisma.missionPipeline.findFirst({
      where: { runState: 'running' },
      orderBy: { createdAt: 'desc' },
      include: { steps: { orderBy: { orderIndex: 'asc' } } },
    });

    if (!running) {
      return res.json({ ok: true, mission: null });
    }

    const outputsJson = running.outputsJson != null && typeof running.outputsJson === 'object' ? running.outputsJson : {};
    const consensus = outputsJson.consensus ?? null;

    const steps = (running.steps ?? []).map((s) => {
      const completedAt = s.completedAt ? new Date(s.completedAt) : null;
      const startedAt = s.startedAt ? new Date(s.startedAt) : null;
      const durationMs = completedAt && startedAt ? completedAt - startedAt : null;
      return { tool: s.toolName, status: s.status, durationMs, label: s.label };
    });

    res.json({
      ok: true,
      mission: {
        missionId: running.id,
        name: running.title,
        status: running.status,
        runState: running.runState,
        steps,
        consensus: consensus ? { decision: consensus.consensusDecision ?? consensus.decision, ballots: consensus.ballots ?? [], confidence: consensus.confidence ?? null } : undefined,
      },
    });
  } catch (e) {
    console.error('[admin/pipeline/live]', e);
    res.status(500).json({ ok: false, error: e?.message ?? 'Failed to load pipeline live' });
  }
});

router.get('/pipeline/stats', async (req, res) => {
  try {
    const prisma = getPrismaClient();
    const today = new Date().toISOString().slice(0, 10);
    const startOfToday = new Date(today);

    const [todayMissions, completedToday, failedToday, llmAgg] = await Promise.all([
      prisma.missionPipeline.findMany({ where: { createdAt: { gte: startOfToday } }, select: { id: true, status: true, completedAt: true, failedAt: true, startedAt: true } }),
      prisma.missionPipeline.count({ where: { status: 'completed', completedAt: { gte: startOfToday } } }),
      prisma.missionPipeline.count({ where: { status: 'failed', failedAt: { gte: startOfToday } } }),
      prisma.llmUsageDaily.aggregate({ where: { day: today }, _count: true }).catch(() => ({ _count: 0 })),
    ]);

    const totalToday = todayMissions.length;
    const successRate = totalToday > 0 ? (completedToday / totalToday) * 100 : 0;
    const withDuration = todayMissions.filter((m) => m.completedAt && m.startedAt);
    const totalMs = withDuration.reduce((acc, m) => acc + (new Date(m.completedAt) - new Date(m.startedAt)), 0);
    const avgDurationMs = withDuration.length > 0 ? Math.round(totalMs / withDuration.length) : null;
    const llmCallsToday = llmAgg?._count ?? 0;
    const llmCap = process.env.LLM_DAILY_CAP != null && process.env.LLM_DAILY_CAP !== '' ? Math.max(0, parseInt(process.env.LLM_DAILY_CAP, 10) || 0) : 100000;

    res.json({
      ok: true,
      successRate: Math.round(successRate * 100) / 100,
      avgDurationMs,
      totalToday,
      failedToday,
      llmCallsToday,
      llmCap,
    });
  } catch (e) {
    console.error('[admin/pipeline/stats]', e);
    res.status(500).json({ ok: false, error: e?.message ?? 'Failed to load pipeline stats' });
  }
});

export default router;
