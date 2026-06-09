/**
 * Agent Execution Broker — read-only introspection API (Phase 1).
 */

import { Router } from 'express';
import { optionalAuth } from '../middleware/auth.js';
import { listBrokerActions, listAgentCapabilities } from '../lib/broker/index.js';
import { getRuntimeAuthoritySnapshot } from '../lib/runtime/performerRuntime/runtimeAuthorityStaging.js';
import { getPhaseFBypassSnapshot } from '../lib/broker/phaseFBypassStaging.js';

const router = Router();

/**
 * GET /api/broker/actions — unified action catalog (derived read model).
 */
router.get('/actions', optionalAuth, (_req, res) => {
  const actions = listBrokerActions();
  return res.json({
    ok: true,
    count: actions.length,
    actions,
  });
});

/**
 * GET /api/broker/agent-capabilities — ACP normalized agent capabilities.
 */
router.get('/agent-capabilities', optionalAuth, (_req, res) => {
  const capabilities = listAgentCapabilities();
  return res.json({
    ok: true,
    count: capabilities.length,
    capabilities,
  });
});

/**
 * GET /api/broker/runtime-authority — staging rollout snapshot + in-process metrics.
 */
router.get('/runtime-authority', optionalAuth, (_req, res) => {
  return res.json(getRuntimeAuthoritySnapshot());
});

/**
 * GET /api/broker/phase-f-bypass — Phase F telemetry + closure flag snapshot.
 */
router.get('/phase-f-bypass', optionalAuth, (_req, res) => {
  return res.json(getPhaseFBypassSnapshot());
});

export default router;
