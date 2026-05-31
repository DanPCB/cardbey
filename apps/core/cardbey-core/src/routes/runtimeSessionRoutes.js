/**
 * Runtime Session — Performer rehydration authority.
 * GET  /api/runtime/session/active
 * POST /api/runtime/session/select-store
 * POST /api/runtime/session/resume-mission
 */

import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  isRuntimeSessionRehydrationEnabled,
  resolveActiveRuntimeSession,
  selectStoreForSession,
  resumeMissionForSession,
} from '../lib/runtime/runtimeSessionService.js';
import { requireRuntimeCapability } from '../lib/runtime/runtimeCapabilitiesService.js';

const router = express.Router();

function sessionDisabled(res, capability = 'runtimeSessionRehydration') {
  const gate = requireRuntimeCapability(/** @type {import('../lib/runtime/runtimeCapabilitiesService.js').RuntimeCapabilityKey} */ (capability), {
    source: 'runtime_session_route',
  });
  return res.status(503).json({
    ok: false,
    code: gate.ok ? 'RUNTIME_CAPABILITY_UNAVAILABLE' : gate.code,
    capability,
    message: gate.ok ? 'Session recovery is not available in this environment.' : gate.message,
  });
}

router.get('/active', requireAuth, async (req, res, next) => {
  try {
    if (!isRuntimeSessionRehydrationEnabled()) {
      return sessionDisabled(res);
    }
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
    const q = req.query ?? {};
    const session = await resolveActiveRuntimeSession({
      userId,
      user: req.user,
      requestedMissionId:
        typeof q.missionId === 'string' ? q.missionId.trim() : null,
      requestedStoreId:
        typeof q.storeId === 'string' ? q.storeId.trim() : null,
      source: typeof q.source === 'string' ? q.source.trim() : 'performer_mount',
    });
    return res.status(200).json(session);
  } catch (err) {
    next(err);
  }
});

router.post('/select-store', requireAuth, async (req, res, next) => {
  try {
    if (!isRuntimeSessionRehydrationEnabled()) {
      return sessionDisabled(res);
    }
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
    const storeId = typeof req.body?.storeId === 'string' ? req.body.storeId.trim() : '';
    if (!storeId) {
      return res.status(400).json({ ok: false, code: 'STORE_ID_REQUIRED' });
    }
    const result = await selectStoreForSession({ userId, user: req.user, storeId });
    if (!result.ok) {
      const status = result.code === 'STORE_NOT_FOUND' ? 404 : 400;
      return res.status(status).json(result);
    }
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/resume-mission', requireAuth, async (req, res, next) => {
  try {
    const resumeGate = requireRuntimeCapability('runtimeMissionResume', {
      source: 'runtime_session_resume',
      missionId: typeof req.body?.missionId === 'string' ? req.body.missionId.trim() : null,
    });
    if (!resumeGate.ok) {
      return res.status(503).json(resumeGate);
    }
    if (!isRuntimeSessionRehydrationEnabled()) {
      return sessionDisabled(res);
    }
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
    const missionId = typeof req.body?.missionId === 'string' ? req.body.missionId.trim() : '';
    if (!missionId) {
      return res.status(400).json({ ok: false, code: 'MISSION_ID_REQUIRED' });
    }
    const result = await resumeMissionForSession({
      userId,
      user: req.user,
      missionId,
      source: typeof req.body?.source === 'string' ? req.body.source.trim() : 'performer_resume',
    });
    if (!result.ok) {
      const status = result.code === 'NOT_FOUND' ? 404 : 400;
      return res.status(status).json(result);
    }
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
