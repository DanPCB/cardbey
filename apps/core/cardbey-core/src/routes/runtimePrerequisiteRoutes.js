/**
 * POST /api/runtime/missions/:missionId/prerequisites/resolve
 * Explicit prerequisite resolution — select store or spawn create-store child mission.
 */

import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRuntimeCapability } from '../lib/runtime/runtimeCapabilitiesService.js';
import { resolvePrerequisiteAction } from '../lib/runtime/runtimePrerequisiteService.js';

const router = express.Router();

router.post('/:missionId/prerequisites/resolve', requireAuth, async (req, res, next) => {
  try {
    const gate = requireRuntimeCapability('runtimePrerequisiteResolution', {
      source: 'runtime_prerequisite_resolve',
      missionId: String(req.params.missionId ?? '').trim() || null,
    });
    if (!gate.ok) {
      return res.status(503).json({
        ok: false,
        code: gate.code,
        capability: gate.capability,
        message: gate.message,
      });
    }

    const missionId = String(req.params.missionId ?? '').trim();
    const body = req.body ?? {};
    const action = String(body.action ?? '').trim();
    const traceId =
      typeof req.headers['x-cardbey-trace-id'] === 'string'
        ? req.headers['x-cardbey-trace-id'].trim()
        : null;

    const result = await resolvePrerequisiteAction({
      user: req.user,
      missionId,
      action,
      storeId: typeof body.storeId === 'string' ? body.storeId.trim() : null,
      storeTitle: typeof body.storeTitle === 'string' ? body.storeTitle.trim() : null,
      autoResume: body.autoResume !== false,
      traceId,
    });

    return res.status(result.httpStatus ?? (result.ok ? 200 : 500)).json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
