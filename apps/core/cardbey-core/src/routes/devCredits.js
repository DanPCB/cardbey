/**
 * Dev-only: Add credits for testing the top-up flow.
 * POST /api/dev/credits/add - body: { amount: number }. Requires auth.
 * Only registered when NODE_ENV !== 'production'.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { addCreditsForDev, getBalance } from '../services/billing/creditsService.js';

const router = Router();

function devOnly(req, res, next) {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ ok: false, error: 'not_found' });
  }
  next();
}

/**
 * POST /api/dev/credits/add
 * Body: { amount: number } (default 100). Adds that many credits to the authenticated user.
 */
router.post('/add', devOnly, requireAuth, async (req, res, next) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'auth_required', message: 'Authentication required' });
    }
    const amount = Math.max(0, Math.floor(Number(req.body?.amount ?? 100)) || 100);
    const result = await addCreditsForDev(userId, amount);
    const balance = await getBalance(userId);
    res.json({
      ok: true,
      added: amount,
      aiCreditsBalance: result.aiCreditsBalance,
      welcomeFullStoreRemaining: balance.welcomeFullStoreRemaining,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
