/**
 * GET /api/admin/activity?limit=10 — activity feed (time, text, status)
 * GET /api/admin/events?limit=20&type=pipeline|all — filterable event log
 * Admin auth required.
 */
import { Router } from 'express';
import { requireAuth, requireAdmin } from '../../middleware/auth.js';
import { getPrismaClient } from '../../lib/prisma.js';

const router = Router();
router.use(requireAuth);
router.use(requireAdmin);

function missionToActivityItem(m) {
  const time = (m.updatedAt || m.createdAt).toISOString?.() ?? new Date().toISOString();
  let status = 'info';
  if (m.status === 'completed') status = 'success';
  else if (m.status === 'failed') status = 'error';
  else if (m.runState === 'running' || m.status === 'executing') status = 'pending';
  const text = `Mission: ${m.title ?? m.type ?? m.id} — ${m.status}${m.runState ? ` (${m.runState})` : ''}`;
  return { time, text, status };
}

router.get('/activity', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 10, 50);
    const prisma = getPrismaClient();
    const missions = await prisma.missionPipeline.findMany({
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: { id: true, title: true, type: true, status: true, runState: true, updatedAt: true, createdAt: true },
    });
    const items = missions.map(missionToActivityItem);
    res.json({ ok: true, items });
  } catch (e) {
    console.error('[admin/activity]', e);
    res.status(500).json({ ok: false, error: e?.message ?? 'Failed to load activity' });
  }
});

router.get('/events', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const type = (req.query.type || 'all').toLowerCase();
    const prisma = getPrismaClient();

    const missions = await prisma.missionPipeline.findMany({
      orderBy: { updatedAt: 'desc' },
      take: type === 'pipeline' ? limit : limit,
      select: { id: true, title: true, type: true, status: true, runState: true, updatedAt: true, createdAt: true, failedAt: true },
    });

    const items = missions.map((m) => {
      const time = (m.updatedAt || m.createdAt).toISOString?.() ?? new Date().toISOString();
      let status = 'info';
      if (m.status === 'completed') status = 'success';
      else if (m.status === 'failed') status = 'error';
      else if (m.runState === 'running' || m.status === 'executing') status = 'pending';
      const text = `Mission: ${m.title ?? m.type ?? m.id} — ${m.status}${m.runState ? ` (${m.runState})` : ''}`;
      return { time, text, status, type: 'mission' };
    });

    res.json({ ok: true, items });
  } catch (e) {
    console.error('[admin/events]', e);
    res.status(500).json({ ok: false, error: e?.message ?? 'Failed to load events' });
  }
});

export default router;
