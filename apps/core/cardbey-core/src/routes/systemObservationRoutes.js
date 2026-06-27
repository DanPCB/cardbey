/**
 * System Observation API — live architecture component status for Control Center.
 */

import express from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { getComponentStatuses, buildStatusSummary, buildDocBaselineSummary } from '../lib/systemObservation/componentStatus.js';
import { getHealthStatus } from '../lib/systemObservation/healthStatus.js';
import { getDependencyGraph } from '../lib/systemObservation/dependencyGraph.js';
import { recordFrontendHeartbeat } from '../lib/systemObservation/frontendHeartbeatStore.js';

const router = express.Router();

export function isSystemObservationEnabled() {
  const raw = process.env.ENABLE_SYSTEM_OBSERVATION;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return process.env.NODE_ENV !== 'production';
  }
  const v = String(raw).trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function observationDisabled(_req, res) {
  return res.status(404).json({ ok: false, error: 'system_observation_disabled' });
}

function requireObservationEnabled(req, res, next) {
  if (!isSystemObservationEnabled()) {
    return observationDisabled(req, res);
  }
  return next();
}

router.use(requireObservationEnabled, requireAuth, requireAdmin);

/**
 * POST /api/system-observation/frontend-heartbeat
 * Dashboard Control Center reports surface availability (Phase 3).
 */
router.post('/frontend-heartbeat', (req, res) => {
  try {
    const body = req.body ?? {};
    const heartbeat = recordFrontendHeartbeat(body, { userId: req.userId ?? null });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, receivedAt: heartbeat.receivedAt });
  } catch (error) {
    console.error('[SystemObservation] frontend-heartbeat error:', error);
    res.status(500).json({ ok: false, error: error.message || 'frontend_heartbeat_failed' });
  }
});

/**
 * GET /api/system-observation/status
 */
router.get('/status', async (_req, res) => {
  try {
    const components = await getComponentStatuses();
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      components,
      summary: buildStatusSummary(components),
      docBaseline: buildDocBaselineSummary(),
    });
  } catch (error) {
    console.error('[SystemObservation] Error fetching status:', error);
    res.status(500).json({ ok: false, error: error.message || 'system_observation_status_failed' });
  }
});

/**
 * GET /api/system-observation/health
 */
router.get('/health', async (_req, res) => {
  try {
    const health = await getHealthStatus();
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, ...health });
  } catch (error) {
    console.error('[SystemObservation] Error fetching health:', error);
    res.status(500).json({ ok: false, error: error.message || 'system_observation_health_failed' });
  }
});

/**
 * GET /api/system-observation/graph
 */
router.get('/graph', async (_req, res) => {
  try {
    const graph = await getDependencyGraph();
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, ...graph });
  } catch (error) {
    console.error('[SystemObservation] Error fetching graph:', error);
    res.status(500).json({ ok: false, error: error.message || 'system_observation_graph_failed' });
  }
});

export default router;
