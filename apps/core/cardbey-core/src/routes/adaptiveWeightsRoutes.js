/**
 * Admin inspection for adaptive pattern weights (super-admin only).
 */
import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireSuperAdmin } from '../lib/authorization.js';
import { getPrismaClient } from '../lib/prisma.js';
import { getAdaptiveWeightService } from '../lib/pil/adaptiveWeights.js';

const router = express.Router();
const adaptiveWeights = getAdaptiveWeightService();

router.get('/weights', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const prisma = getPrismaClient();
    const weights = await prisma.patternWeight.findMany({
      orderBy: { lastAdjusted: 'desc' },
      take: 200,
    });
    return res.json({ ok: true, weights });
  } catch (error) {
    return next(error);
  }
});

router.get('/weights/:patternId', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const patternId = decodeURIComponent(String(req.params.patternId ?? ''));
    const weight = await adaptiveWeights.getWeight(patternId);
    const prisma = getPrismaClient();
    const record = await prisma.patternWeight.findUnique({ where: { patternId } });
    return res.json({ ok: true, patternId, weight, history: record?.adjustmentHistory ?? [] });
  } catch (error) {
    return next(error);
  }
});

router.post('/weights/adjust', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const patternId = String(body.patternId ?? '').trim();
    const adjustment = Number(body.adjustment);
    const reason = String(body.reason ?? 'manual admin adjustment').trim();

    if (!patternId || !Number.isFinite(adjustment)) {
      return res.status(400).json({ ok: false, error: 'patternId and adjustment required' });
    }

    const newWeight = await adaptiveWeights.adjustWeight(patternId, adjustment, reason, {
      source: 'manual',
      adminId: req.user?.id ?? null,
    });

    return res.json({ ok: true, patternId, newWeight });
  } catch (error) {
    return next(error);
  }
});

export default router;
