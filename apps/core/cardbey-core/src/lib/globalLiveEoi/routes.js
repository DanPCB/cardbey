/**
 * Global Live Pilot EOI HTTP routes — public submit + admin review.
 * Gated by Features.globalLiveEoi (default OFF).
 */

import { Router } from 'express';
import { requireAuth, requireAdmin, optionalAuth } from '../../middleware/auth.js';
import { rateLimit } from '../../middleware/rateLimit.js';
import { Features } from '../../config/features.js';
import {
  GLOBAL_LIVE_EOI_ERROR_CODES,
  GlobalLiveEoiStatusPatchSchema,
  GlobalLiveEoiSubmitSchema,
} from './domain.js';
import {
  getPublicConfig,
  listEoiRegistrations,
  submitEoiRegistration,
  updateEoiStatus,
} from './service.js';

function sendError(res, err) {
  const code = err?.code || GLOBAL_LIVE_EOI_ERROR_CODES.VALIDATION;
  const status = err?.status || 400;
  const publicMessage =
    code === GLOBAL_LIVE_EOI_ERROR_CODES.CLOSED
      ? 'Registrations for this pilot are now closed.'
      : code === GLOBAL_LIVE_EOI_ERROR_CODES.DISABLED
        ? 'Global Live EOI is unavailable.'
        : code === GLOBAL_LIVE_EOI_ERROR_CODES.VALIDATION
          ? 'Please check your details and try again.'
          : code === GLOBAL_LIVE_EOI_ERROR_CODES.NOT_FOUND
            ? 'Registration not found.'
            : code === GLOBAL_LIVE_EOI_ERROR_CODES.UNKNOWN_PILOT
              ? 'Unknown pilot.'
              : 'Unable to process your request. Please try again.';

  return res.status(status).json({
    ok: false,
    error: code,
    message: publicMessage,
  });
}

function requireEoiEnabled(req, res, next) {
  if (!Features.globalLiveEoi.v1) {
    return res.status(403).json({
      ok: false,
      error: GLOBAL_LIVE_EOI_ERROR_CODES.DISABLED,
      message: 'Global Live EOI is unavailable.',
    });
  }
  next();
}

const submitLimit = rateLimit({
  windowMs: 60_000,
  max: 10,
  keyGenerator: (req) => `global-live-eoi:${req.ip || 'unknown'}`,
  code: 'rate_limit_exceeded',
  message: 'Too many requests. Please wait and try again.',
});

export const globalLiveEoiPublicRoutes = Router();
export const globalLiveEoiAdminRoutes = Router();

/**
 * GET /api/public/global-live/config
 * Public pilot + open/closed state (no EOI records).
 */
globalLiveEoiPublicRoutes.get('/config', (req, res) => {
  try {
    if (!Features.globalLiveEoi.v1) {
      return res.status(403).json({
        ok: false,
        error: GLOBAL_LIVE_EOI_ERROR_CODES.DISABLED,
        message: 'Global Live EOI is unavailable.',
      });
    }
    const pilotId = req.query.pilotId != null ? String(req.query.pilotId) : undefined;
    const config = getPublicConfig(pilotId);
    return res.json({ ok: true, ...config });
  } catch (err) {
    return sendError(res, err);
  }
});

/**
 * POST /api/public/global-live/registrations
 */
globalLiveEoiPublicRoutes.post(
  '/registrations',
  submitLimit,
  optionalAuth,
  async (req, res) => {
    try {
      if (!Features.globalLiveEoi.v1) {
        return res.status(403).json({
          ok: false,
          error: GLOBAL_LIVE_EOI_ERROR_CODES.DISABLED,
          message: 'Global Live EOI is unavailable.',
        });
      }
      if (!Features.globalLiveEoi.open) {
        return res.status(403).json({
          ok: false,
          error: GLOBAL_LIVE_EOI_ERROR_CODES.CLOSED,
          message: 'Registrations for this pilot are now closed.',
        });
      }

      const parsed = GlobalLiveEoiSubmitSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          ok: false,
          error: GLOBAL_LIVE_EOI_ERROR_CODES.VALIDATION,
          message: 'Please check your details and try again.',
          // Field keys only — no raw PII echo.
          fields: Object.keys(parsed.error.flatten().fieldErrors || {}),
        });
      }

      await submitEoiRegistration(parsed.data, {
        userId: req.userId || req.user?.id || null,
      });

      // Generic success — no account-existence leak; no technical details.
      return res.status(201).json({ ok: true });
    } catch (err) {
      if (
        err?.code === GLOBAL_LIVE_EOI_ERROR_CODES.CLOSED ||
        err?.code === GLOBAL_LIVE_EOI_ERROR_CODES.DISABLED ||
        err?.code === GLOBAL_LIVE_EOI_ERROR_CODES.UNKNOWN_PILOT ||
        err?.code === GLOBAL_LIVE_EOI_ERROR_CODES.VALIDATION
      ) {
        return sendError(res, err);
      }
      console.warn('[GlobalLiveEoi] submit failed', { code: err?.code || 'unknown' });
      return res.status(500).json({
        ok: false,
        error: 'GLOBAL_LIVE_EOI_ERROR',
        message: 'Unable to process your request. Please try again.',
      });
    }
  },
);

globalLiveEoiAdminRoutes.use(requireAuth, requireAdmin, requireEoiEnabled);

/**
 * GET /api/admin/global-live/registrations
 */
globalLiveEoiAdminRoutes.get('/registrations', async (req, res) => {
  try {
    const result = await listEoiRegistrations({
      pilotId: req.query.pilotId,
      status: req.query.status,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    return res.json({ ok: true, ...result });
  } catch (err) {
    return sendError(res, err);
  }
});

/**
 * PATCH /api/admin/global-live/registrations/:id
 */
globalLiveEoiAdminRoutes.patch('/registrations/:id', async (req, res) => {
  try {
    const parsed = GlobalLiveEoiStatusPatchSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: GLOBAL_LIVE_EOI_ERROR_CODES.VALIDATION,
        message: 'Invalid status.',
      });
    }
    const item = await updateEoiStatus(req.params.id, parsed.data.status);
    return res.json({ ok: true, item });
  } catch (err) {
    return sendError(res, err);
  }
});
