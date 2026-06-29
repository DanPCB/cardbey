/**
 * POST /api/performer/dispatch — unified dashboard dispatch (backend-first pipeline).
 */

import { Router } from 'express';
import { requireUserOrGuest } from '../middleware/guestAuth.js';
import { runPerformerDispatchPipeline } from '../lib/intake/dispatchPipeline.js';
import { FEATURE_FLAGS, getFeatureFlagsSnapshot } from '../config/featureFlags.js';

const router = Router();

router.get('/dispatch/health', (_req, res) => {
  res.json({
    ok: true,
    useBackendDispatch: FEATURE_FLAGS.USE_BACKEND_DISPATCH,
    features: getFeatureFlagsSnapshot(),
  });
});

/**
 * Body:
 * {
 *   action: { type, payload?, storeId?, missionId?, source?, requireConfirmation? },
 *   options?: { confirmed?, skipPlanning?, requireConfirmation?, source? },
 *   conversationId?: string,
 *   memorySnapshot?: object
 * }
 */
router.post('/dispatch', requireUserOrGuest, async (req, res) => {
  if (!FEATURE_FLAGS.USE_BACKEND_DISPATCH) {
    return res.status(503).json({
      ok: false,
      status: 'disabled',
      error: {
        code: 'BACKEND_DISPATCH_DISABLED',
        message: 'Backend dispatch is disabled (USE_BACKEND_DISPATCH=false)',
      },
      dispatchSource: 'backend',
    });
  }

  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const action =
      body.action && typeof body.action === 'object'
        ? body.action
        : {
            type: body.type ?? body.actionType,
            payload: body.payload ?? body.parameters ?? {},
            storeId: body.storeId ?? body.context?.storeId,
            missionId: body.missionId ?? body.context?.missionId,
            source: body.source ?? body.context?.source ?? 'dashboard',
            requireConfirmation: body.requireConfirmation,
          };

    const options =
      body.options && typeof body.options === 'object'
        ? body.options
        : {
            confirmed: body.confirmed,
            skipPlanning: body.skipPlanning,
            requireConfirmation: body.requireConfirmation,
            source: body.source,
          };

    const result = await runPerformerDispatchPipeline({
      action,
      options,
      req,
      conversationId:
        (typeof body.conversationId === 'string' && body.conversationId.trim()) ||
        (typeof body.sessionId === 'string' && body.sessionId.trim()) ||
        null,
      memorySnapshot:
        body.memorySnapshot && typeof body.memorySnapshot === 'object'
          ? body.memorySnapshot
          : body.context?.unifiedMemory && typeof body.context.unifiedMemory === 'object'
            ? body.context.unifiedMemory
            : null,
    });

    const httpStatus =
      result.status === 'pending_confirmation'
        ? 202
        : result.ok === false && result.status === 'error'
          ? 400
          : 200;

    return res.status(httpStatus).json({
      success: result.ok !== false && result.status !== 'pending_confirmation',
      ...result,
    });
  } catch (error) {
    console.error('[performer/dispatch] Error:', error);
    return res.status(500).json({
      success: false,
      ok: false,
      status: 'error',
      error: { code: 'DISPATCH_FAILED', message: error?.message || 'Dispatch failed' },
      requiresConfirmation: false,
      dispatchSource: 'backend',
    });
  }
});

export default router;
