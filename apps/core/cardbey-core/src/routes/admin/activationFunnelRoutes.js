/**
 * GET /api/admin/activation/funnel
 * Phase 1 outcome-activation counts. Not the discovered-business GTM funnel.
 */

import { Router } from 'express';
import { loadActivationFunnel } from '../../services/activation/activationEvents.js';

const router = Router();

router.get('/activation/funnel', async (_req, res) => {
  try {
    const funnel = await loadActivationFunnel();
    return res.status(200).json(funnel);
  } catch (err) {
    return res.status(200).json({
      ok: true,
      source: 'outcome_activation_json',
      liveMeta: false,
      totalEvents: 0,
      totals: {},
      byCapability: {},
      byVariant: {},
      error: err?.message || 'unavailable',
    });
  }
});

export default router;
