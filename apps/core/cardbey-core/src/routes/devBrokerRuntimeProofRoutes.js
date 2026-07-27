/**
 * Dev-only Broker / Runtime proof routes.
 *
 * Purpose:
 * - Provide test-only proof for Stage D direct bypass guard (BROKER_DIRECT_ACTION_BLOCKED)
 * - Provide test-only proof for Stage E runtime ownership blocking (RUNTIME_OWNERSHIP_REQUIRED)
 *
 * Never available in production.
 */

import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { guardBrokerDirectAction } from '../lib/broker/brokerRunwayGuard.js';
import { dispatchTool } from '../lib/toolDispatcher.js';
import { getRuntimeAuthoritySnapshot, incrementRuntimeAuthorityMetric } from '../lib/runtime/performerRuntime/runtimeAuthorityStaging.js';

const router = express.Router();

function ensureNonProduction(req, res) {
  if (process.env.NODE_ENV === 'production') {
    res.status(403).json({ ok: false, error: 'Not available in production' });
    return false;
  }
  // Only allow explicit dev superuser token sessions.
  if (!req.user?.isDevAdmin) {
    res.status(403).json({ ok: false, error: 'forbidden', message: 'dev-admin-token required' });
    return false;
  }
  return true;
}

/**
 * GET /api/dev/broker/runtime-authority
 * Convenience passthrough for debugging.
 */
router.get('/runtime-authority', requireAuth, (req, res) => {
  if (!ensureNonProduction(req, res)) return;
  return res.json(getRuntimeAuthoritySnapshot());
});

/**
 * POST /api/dev/broker/direct-bypass-probe
 *
 * Proof for Stage D:
 * - When BROKER_BLOCK_DIRECT_ACTION=true, guardBrokerDirectAction() should return blocked.
 *
 * Returns 409 when blocked (expected), 200 when not blocked.
 */
router.post('/direct-bypass-probe', requireAuth, (req, res) => {
  if (!ensureNonProduction(req, res)) return;
  const g = guardBrokerDirectAction();
  if (g.blocked) {
    // Metric: intentional direct bypass test
    incrementRuntimeAuthorityMetric('executionFailures');
    return res.status(409).json({
      ok: true,
      expectedBlocked: true,
      blocker: { code: g.code, message: g.message },
    });
  }
  return res.json({ ok: true, expectedBlocked: false });
});

/**
 * POST /api/dev/broker/orphan-dispatch-probe
 *
 * Proof for Stage E:
 * - Attempt a tool dispatch without runtime ownership context.
 * - When PERFORMER_RUNTIME_OWNERSHIP_BLOCK=true, dispatchTool should return status=blocked.
 *
 * Body: { toolName?: string }
 */
router.post('/orphan-dispatch-probe', requireAuth, async (req, res) => {
  if (!ensureNonProduction(req, res)) return;
  const toolName = typeof req.body?.toolName === 'string' && req.body.toolName.trim()
    ? req.body.toolName.trim()
    : 'signage.list-devices';

  const result = await dispatchTool(toolName, {}, { source: 'dev_orphan_probe' });
  const blocked = result?.status === 'blocked';
  if (blocked) incrementRuntimeAuthorityMetric('ownershipBlocks');

  return res.status(blocked ? 409 : 200).json({
    ok: true,
    toolName,
    blocked,
    result,
  });
});

export default router;

