/**
 * GET /api/admin/cai/summary — CAI earned, spent, pending for dashboard pie chart
 * Admin auth required.
 */
import { Router } from 'express';
import { requireAuth, requireAdmin } from '../../middleware/auth.js';
import { getPrismaClient } from '../../lib/prisma.js';

const router = Router();
router.use(requireAuth);
router.use(requireAdmin);

router.get('/cai/summary', async (req, res) => {
  try {
    const prisma = getPrismaClient();
    let earned = 0;
    let spent = 0;
    let pending = 0;
    try {
      const rewards = await prisma.orchestratorRunReward?.aggregate({
        _sum: { overallReward: true },
      }).catch(() => ({ _sum: { overallReward: null } }));
      earned = rewards?._sum?.overallReward ?? 0;
    } catch {
      // no CAI table
    }
    res.json({
      ok: true,
      earned: Math.max(0, Number(earned)),
      spent: Math.max(0, Number(spent)),
      pending: Math.max(0, Number(pending)),
    });
  } catch (e) {
    console.error('[admin/cai/summary]', e);
    res.status(500).json({ ok: false, error: e?.message ?? 'Failed to load CAI summary' });
  }
});

export default router;
