/**
 * Performer Runtime — read API (Phase 1.5).
 */

import { Router } from 'express';
import { optionalAuth } from '../middleware/auth.js';
import {
  getRuntimeByMissionId,
  getRuntimeById,
  getUnifiedRuntimeStream,
  runtimeContextSnapshot,
} from '../lib/runtime/performerRuntime/index.js';
import { dryRunExecutionPlan } from '../lib/runtime/performerRuntime/dryRunExecutionPlan.js';

const router = Router();

/**
 * POST /api/performer/runtime/dry-run — validate plan against broker registry (no execution).
 */
router.post('/dry-run', optionalAuth, async (req, res) => {
  try {
    const result = await dryRunExecutionPlan(req.body ?? {});
    if (!result.ok) {
      const status = result.error === 'mission_id_required' ? 400 : 400;
      return res.status(status).json(result);
    }
    return res.json(result);
  } catch (err) {
    console.error('[performer/runtime/dry-run]', err);
    return res.status(500).json({ ok: false, error: 'dry_run_failed' });
  }
});

/**
 * GET /api/performer/runtime/:missionId/stream — unified operational timeline.
 */
router.get('/:missionId/stream', optionalAuth, async (req, res) => {
  const missionId = typeof req.params.missionId === 'string' ? req.params.missionId.trim() : '';
  if (!missionId) {
    return res.status(400).json({ ok: false, error: 'mission_id_required' });
  }
  const afterSeq = req.query.afterSeq != null ? parseInt(String(req.query.afterSeq), 10) : undefined;
  const limit = req.query.limit != null ? parseInt(String(req.query.limit), 10) : undefined;
  const { events, error } = await getUnifiedRuntimeStream(missionId, {
    ...(Number.isFinite(afterSeq) ? { afterSeq } : {}),
    ...(Number.isFinite(limit) ? { limit } : {}),
  });
  if (error) {
    return res.status(400).json({ ok: false, error });
  }
  return res.json({ ok: true, missionId, events });
});

/**
 * GET /api/performer/runtime/:missionId/state — authoritative runtime snapshot.
 */
router.get('/:missionId/state', optionalAuth, async (req, res) => {
  const missionId = typeof req.params.missionId === 'string' ? req.params.missionId.trim() : '';
  if (!missionId) {
    return res.status(400).json({ ok: false, error: 'mission_id_required' });
  }
  const ctx = getRuntimeByMissionId(missionId);
  if (!ctx) {
    return res.json({ ok: true, missionId, runtime: null });
  }
  return res.json({
    ok: true,
    missionId,
    runtime: runtimeContextSnapshot(ctx),
    graph: ctx.actionGraph,
  });
});

/**
 * GET /api/performer/runtime/by-id/:runtimeId — runtime by runtimeId.
 */
router.get('/by-id/:runtimeId', optionalAuth, async (req, res) => {
  const runtimeId = typeof req.params.runtimeId === 'string' ? req.params.runtimeId.trim() : '';
  if (!runtimeId) {
    return res.status(400).json({ ok: false, error: 'runtime_id_required' });
  }
  const ctx = getRuntimeById(runtimeId);
  if (!ctx) {
    return res.json({ ok: true, runtimeId, runtime: null });
  }
  return res.json({
    ok: true,
    runtimeId,
    runtime: runtimeContextSnapshot(ctx),
    graph: ctx.actionGraph,
  });
});

export default router;
