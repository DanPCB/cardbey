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

const router = Router();

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
