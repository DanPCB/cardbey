/**
 * Billing: balance endpoint for UI (credits + welcome bundle remaining).
 * GET /api/billing/balance requires auth.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getBalance } from '../services/billing/creditsService.js';

const router = Router();

/**
 * GET /api/billing/balance
 * Returns { aiCreditsBalance, welcomeFullStoreRemaining } for the authenticated user.
 */
router.get('/balance', requireAuth, async (req, res, next) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({
        ok: false,
        code: 'AUTH_REQUIRED',
        message: 'Authentication required',
      });
    }
    const balance = await getBalance(userId);
    res.json({
      ok: true,
      aiCreditsBalance: balance.aiCreditsBalance,
      welcomeFullStoreRemaining: balance.welcomeFullStoreRemaining,
    });
  } catch (err) {
    // Prisma client out of sync or migration not applied: return safe default so UI doesn't 500
    const isPrismaValidation = err?.name === 'PrismaClientValidationError' ||
      (typeof err?.message === 'string' && err.message.includes('Unknown field'));
    if (isPrismaValidation) {
      console.warn('[billing/balance] Prisma validation (run prisma generate + migrate):', err?.message?.slice(0, 200));
      return res.json({
        ok: true,
        aiCreditsBalance: 0,
        welcomeFullStoreRemaining: 0,
      });
    }
    next(err);
  }
});

export default router;
