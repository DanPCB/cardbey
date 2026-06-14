/**
 * Beta rollout API — controlled PIL enablement for production.
 * GET  /api/beta/status
 * GET  /api/beta/config (super_admin)
 * POST /api/beta/config (super_admin) — adjust canary percentage at runtime
 */
import express from 'express';
import { z } from 'zod';
import { optionalAuth } from '../middleware/auth.js';
import { requireAuth } from '../middleware/auth.js';
import { requireSuperAdmin } from '../lib/authorization.js';
import {
  getBetaRolloutSnapshot,
  getCanaryPercentage,
  setCanaryPercentage,
  reloadBetaAllowlist,
} from '../services/beta/betaUserService.js';

const router = express.Router();

router.get('/beta/status', optionalAuth, (req, res) => {
  const userId = req.user?.id ? String(req.user.id) : null;
  return res.json(getBetaRolloutSnapshot(userId));
});

router.get('/beta/config', requireAuth, requireSuperAdmin, (_req, res) => {
  return res.json({
    ok: true,
    canaryPercentage: getCanaryPercentage(),
  });
});

const configBodySchema = z.object({
  canaryPercentage: z.number().int().min(0).max(100),
});

router.post('/beta/config', requireAuth, requireSuperAdmin, (req, res) => {
  try {
    const parsed = configBodySchema.parse(req.body);
    const canaryPercentage = setCanaryPercentage(parsed.canaryPercentage);
    return res.json({ ok: true, canaryPercentage });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ ok: false, error: 'Validation error', details: error.errors });
    }
    return res.status(400).json({ ok: false, error: error?.message || 'Invalid request' });
  }
});

router.post('/beta/reload-allowlist', requireAuth, requireSuperAdmin, (_req, res) => {
  reloadBetaAllowlist();
  return res.json({ ok: true, message: 'Allowlist reloaded from env' });
});

export default router;
