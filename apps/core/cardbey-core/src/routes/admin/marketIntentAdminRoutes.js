/**
 * Market Intent admin test API — internal operator surface only.
 * POST /api/admin/market-intent/analyze
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '../../middleware/auth.js';
import { rateLimitMiddleware } from '../../services/reliability/rateLimitMiddleware.js';
import {
  analyzeMarketIntentForAdmin,
  getMarketIntentAdminSemanticHealth,
  MarketIntentAdminError,
} from '../../lib/marketIntent/admin/marketIntentAdminService.js';
import {
  isMarketIntentAdminTestUiEnabled,
  MARKET_INTENT_ADMIN_MAX_RAW_TEXT,
} from '../../lib/marketIntent/admin/marketIntentAdminConfig.js';
import { safeJson } from '../../middleware/requestResponseState.js';

const router = Router();

const analyzeRateLimit = rateLimitMiddleware({
  endpoint: '/api/admin/market-intent/analyze',
  windowMs: 60_000,
  maxRequests: 20,
  perUser: true,
});

router.use(requireAuth, requireAdmin, analyzeRateLimit);

function requireMarketIntentAdminEnabled(req, res, next) {
  if (!isMarketIntentAdminTestUiEnabled()) {
    return safeJson(
      res,
      404,
      {
        ok: false,
        error: 'market_intent_admin_disabled',
        message: 'Market Intent admin test UI is disabled',
      },
      req,
    );
  }
  return next();
}

router.use(requireMarketIntentAdminEnabled);

const AnalyzeSchema = z.object({
  rawText: z.string().trim().min(1).max(MARKET_INTENT_ADMIN_MAX_RAW_TEXT),
  sourceType: z.enum(['social_post', 'website', 'community_post', 'manual_note', 'other']).default('social_post'),
  sourceUrl: z.string().trim().url().max(2048).optional().nullable(),
  sourceRef: z.string().trim().max(512).optional().nullable(),
  permitted: z.literal(true, {
    errorMap: () => ({ message: 'permitted must be true' }),
  }),
});

function sendError(res, req, status, body) {
  safeJson(res, status, body, req);
}

/** GET /api/admin/market-intent/semantic-health */
router.get('/semantic-health', (req, res) => {
  const health = getMarketIntentAdminSemanticHealth();
  safeJson(
    res,
    200,
    {
      ok: true,
      ...health,
      label:
        health.semanticStatus === 'AVAILABLE'
          ? 'Semantic analysis: Available'
          : 'Semantic analysis: Unavailable',
    },
    req,
  );
});

/** POST /api/admin/market-intent/analyze */
router.post('/analyze', async (req, res) => {
  try {
    const parsed = AnalyzeSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join('; ') || 'Invalid request';
      return sendError(res, req, 400, { ok: false, error: 'invalid_input', message });
    }

    if (req.isRequestAborted?.()) return;

    const result = await analyzeMarketIntentForAdmin({
      ...parsed.data,
      abortSignal: req.abortSignal,
    });

    if (req.isRequestAborted?.()) return;

    safeJson(res, 200, result, req);
  } catch (error) {
    if (req.isRequestAborted?.()) return;

    if (error instanceof MarketIntentAdminError) {
      if (error.code === 'request_aborted') {
        return sendError(res, req, 408, {
          ok: false,
          error: 'request_timeout',
          message: error.message,
        });
      }
      const status = error.code === 'permission_required' ? 403 : 400;
      return sendError(res, req, status, {
        ok: false,
        error: error.code,
        message: error.message,
      });
    }
    console.error('[marketIntentAdminRoutes]', error?.message || error);
    sendError(res, req, 500, {
      ok: false,
      error: 'internal_error',
      message: 'Analysis failed',
    });
  }
});

export default router;
