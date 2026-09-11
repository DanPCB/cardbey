/**
 * User-facing Grow Your Business API.
 * POST /api/growth/opportunities/preview  — guest-safe semantic understanding (no matching/persist)
 * POST /api/growth/opportunities/analyze  — authenticated matching
 *
 * Does not proxy /api/admin/market-intent.
 * Does not admit graph nodes or mutate business profiles.
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { rateLimitMiddleware } from '../../services/reliability/rateLimitMiddleware.js';
import { safeJson } from '../../middleware/requestResponseState.js';
import { isGrowYourBusinessV1Enabled, GROW_YOUR_BUSINESS_MAX_RAW_TEXT } from '../../lib/growYourBusiness/growYourBusinessConfig.js';
import {
  analyzeGrowYourBusinessIntent,
  previewGrowYourBusinessIntent,
  GrowYourBusinessError,
} from '../../lib/growYourBusiness/growYourBusinessService.js';

const router = Router();

const analyzeRateLimit = rateLimitMiddleware({
  endpoint: '/api/growth/opportunities/analyze',
  windowMs: 60_000,
  maxRequests: 10,
  perUser: true,
});

const previewRateLimit = rateLimitMiddleware({
  endpoint: '/api/growth/opportunities/preview',
  windowMs: 60_000,
  maxRequests: 8,
  perUser: false,
});

function requireGrowYourBusinessEnabled(req, res, next) {
  if (!isGrowYourBusinessV1Enabled()) {
    return safeJson(
      res,
      404,
      {
        ok: false,
        error: 'grow_your_business_disabled',
        message: 'Grow Your Business is not available',
      },
      req,
    );
  }
  return next();
}

router.use(requireGrowYourBusinessEnabled);

const AnalyzeSchema = z.object({
  rawText: z.string().trim().min(1).max(GROW_YOUR_BUSINESS_MAX_RAW_TEXT),
  storeId: z.string().trim().max(128).optional().nullable(),
  locale: z.string().trim().max(16).optional().nullable(),
});

function sendError(res, req, status, body) {
  safeJson(res, status, body, req);
}

function toGuestPreviewDto(result) {
  return {
    ok: Boolean(result?.ok),
    status: result?.status || 'failed',
    understanding: result?.understanding || null,
    clarification: result?.clarification || null,
    opportunities: [],
    nextActions: Array.isArray(result?.nextActions)
      ? result.nextActions.filter((action) => action?.id !== 'save_request' && action?.id !== 'improve_profile')
      : [],
    empty: true,
    retryable: Boolean(result?.retryable),
    error: result?.error || null,
    guestPreview: true,
  };
}

/** POST /api/growth/opportunities/preview — guest-safe intent understanding only. */
router.post('/preview', previewRateLimit, async (req, res) => {
  try {
    const parsed = AnalyzeSchema.pick({ rawText: true, locale: true }).safeParse(req.body ?? {});
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join('; ') || 'Invalid request';
      return sendError(res, req, 400, { ok: false, error: 'invalid_input', message });
    }

    if (req.isRequestAborted?.()) return;

    const result = await previewGrowYourBusinessIntent({
      rawText: parsed.data.rawText,
      locale: parsed.data.locale,
    });

    if (req.isRequestAborted?.()) return;

    safeJson(res, result.ok ? 200 : 503, toGuestPreviewDto(result), req);
  } catch (error) {
    if (req.isRequestAborted?.()) return;

    if (error instanceof GrowYourBusinessError) {
      const status = error.code === 'invalid_input' ? 400 : 500;
      return sendError(res, req, status, {
        ok: false,
        error: error.code,
        message: error.message,
        guestPreview: true,
        opportunities: [],
      });
    }
    console.error('[growYourBusinessRoutes.preview]', error?.message || error);
    sendError(res, req, 500, {
      ok: false,
      error: 'internal_error',
      message: 'Cardbey could not understand that just now. Please try again.',
      guestPreview: true,
      opportunities: [],
    });
  }
});

/** POST /api/growth/opportunities/analyze — authenticated matching. */
router.post('/analyze', requireAuth, analyzeRateLimit, async (req, res) => {
  try {
    const parsed = AnalyzeSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join('; ') || 'Invalid request';
      return sendError(res, req, 400, { ok: false, error: 'invalid_input', message });
    }

    if (req.isRequestAborted?.()) return;

    const userId = String(req.userId || req.user?.id || '').trim();
    if (!userId) {
      return sendError(res, req, 401, { ok: false, error: 'unauthorized', message: 'Sign in to continue' });
    }

    const result = await analyzeGrowYourBusinessIntent({
      rawText: parsed.data.rawText,
      userId,
      storeId: parsed.data.storeId,
      locale: parsed.data.locale,
    });

    if (req.isRequestAborted?.()) return;

    const { guestPreview: _ignored, ...authed } = result;
    safeJson(res, result.ok ? 200 : 503, { ...authed, guestPreview: false }, req);
  } catch (error) {
    if (req.isRequestAborted?.()) return;

    if (error instanceof GrowYourBusinessError) {
      const status = error.code === 'invalid_input' ? 400 : 500;
      return sendError(res, req, status, {
        ok: false,
        error: error.code,
        message: error.message,
      });
    }
    console.error('[growYourBusinessRoutes]', error?.message || error);
    sendError(res, req, 500, {
      ok: false,
      error: 'internal_error',
      message: 'Cardbey could not understand that just now. Please try again.',
    });
  }
});

export default router;
