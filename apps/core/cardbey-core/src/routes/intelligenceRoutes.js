/**
 * Intelligence Foundation API
 * GET  /api/intelligence/health
 * POST /api/intelligence/memory
 * POST /api/intelligence/express
 */
import { Router } from 'express';
import { optionalAuth, requireAuth, requireAdmin } from '../middleware/auth.js';
import { guestSessionId } from '../middleware/guestSession.js';
import { fetchMemoryBundle } from '../lib/intelligence/memoryAdapter.js';
import { expressWithLlm, isIntelligenceLlmAvailable } from '../lib/intelligence/expressWithLlm.js';
import {
  snapshot as foundationMetricsSnapshot,
  recordRouteLatency,
  record as recordFoundationMetric,
} from '../lib/metrics/foundationMetrics.js';
import {
  getFleetIntelligenceOverrides,
  setFleetIntelligenceOverrides,
} from '../services/intelligence/intelligenceOverrideService.js';

const router = Router();

const VALID_SURFACES = new Set(['pil', 'briefing', 'smart_object', 'discover']);

/** Staging/dev: open for bake scripts. Production: requireAuth + requireAdmin only. */
function foundationMetricsGate(req, res, next) {
  const isNonProd = process.env.NODE_ENV !== 'production';
  const isStaging =
    String(process.env.RENDER_SERVICE_NAME ?? '').toLowerCase().includes('staging') ||
    process.env.CARDBEY_ENV === 'staging';
  if (isNonProd || isStaging) return next();
  return requireAuth(req, res, () => requireAdmin(req, res, next));
}

function buildFallbackExpression(surface, context, suggestions) {
  const primary = suggestions[0]?.id ?? 'explore_feed';
  const secondary = suggestions.slice(1, 3).map((s) => s.id);
  const actor = context?.actor?.type ?? 'guest';

  let title = 'How can I help?';
  let message = 'Ask Performer or explore Cardbey.';

  if (surface === 'briefing') {
    const hour = new Date().getHours();
    title = hour < 12 ? 'Good morning.' : hour < 18 ? 'Good afternoon.' : 'Good evening.';
    message = 'Here is a concise read on your store and suggested next steps.';
  } else if (actor === 'guest') {
    title = 'Need help exploring Cardbey?';
    message = 'I can help you find businesses, offers, products, or services.';
  } else if (actor === 'consumer') {
    title = 'Welcome back.';
    message = 'I can help you continue exploring, compare offers, or create your own space.';
  } else if (actor === 'store_owner') {
    title = 'Welcome back.';
    message = 'I can help you review your store, prepare a promotion, or check your briefings.';
  }

  return {
    title,
    message,
    primarySuggestionId: primary,
    secondarySuggestionIds: secondary,
  };
}

router.get('/health', (_req, res) => {
  res.json({
    ok: true,
    status: 'ok',
    layers: ['memory', 'assessment', 'suggestion', 'expression'],
    llmAvailable: isIntelligenceLlmAvailable(),
  });
});

router.get('/overrides', async (_req, res) => {
  try {
    const overrides = await getFleetIntelligenceOverrides();
    recordFoundationMetric('intelligence_override_fetch_total', { outcome: 'ok' });
    res.set('Cache-Control', 'public, max-age=30');
    res.json({ ok: true, overrides });
  } catch (err) {
    recordFoundationMetric('intelligence_override_fetch_total', { outcome: 'error' });
    console.warn('[intelligence/overrides] GET error:', err?.message);
    res.set('Cache-Control', 'public, max-age=30');
    res.json({ ok: true, overrides: {} });
  }
});

router.put('/overrides', foundationMetricsGate, async (req, res) => {
  try {
    const actorId = req.user?.id ? String(req.user.id) : null;
    const overrides = await setFleetIntelligenceOverrides(req.body ?? {}, actorId);
    recordFoundationMetric('intelligence_override_change_total', { outcome: 'ok' });
    res.json({ ok: true, overrides });
  } catch (err) {
    recordFoundationMetric('intelligence_override_change_total', {
      outcome: err?.statusCode === 400 ? 'validation_error' : 'error',
    });
    const status = err?.statusCode ?? 500;
    res.status(status).json({
      ok: false,
      error: err?.message ?? 'Failed to set overrides',
      code: err?.code ?? 'internal_error',
    });
  }
});

router.get('/metrics', foundationMetricsGate, (_req, res) => {
  res.json({
    ok: true,
    gate:
      process.env.NODE_ENV !== 'production' ||
      String(process.env.RENDER_SERVICE_NAME ?? '').toLowerCase().includes('staging') ||
      process.env.CARDBEY_ENV === 'staging'
        ? 'staging_or_dev_open'
        : 'production_admin',
    ...foundationMetricsSnapshot(),
  });
});

router.post('/memory', guestSessionId, optionalAuth, async (req, res) => {
  const started = Date.now();
  try {
    const { actor, storeId, sessionId, sessionHints, missionId } = req.body ?? {};
    if (!actor?.type) {
      return res.status(400).json({ ok: false, error: 'actor.type is required', code: 'invalid_input' });
    }

    const ownerId = req.user?.id ? String(req.user.id) : actor.userId ?? null;

    const bundle = await fetchMemoryBundle({
      actor: {
        type: actor.type,
        userId: actor.userId ?? ownerId,
      },
      storeId: storeId ?? null,
      sessionId: sessionId ?? (req.guestSessionId ? `guest_${req.guestSessionId}` : null),
      sessionHints: sessionHints ?? {},
      missionId: missionId ?? null,
      ownerId,
    });

    const ms = Date.now() - started;
    recordRouteLatency('intelligence_memory', ms);
    res.json(bundle);
  } catch (err) {
    const ms = Date.now() - started;
    recordRouteLatency('intelligence_memory', ms, { error: true });
    recordFoundationMetric('intelligence_memory_total', { outcome: 'error' }, {
      log: { evt: 'intelligence_memory_error', surface: 'memory', reason: 'route_exception', ms },
    });
    console.warn('[intelligence/memory] error:', err?.message);
    res.status(500).json({ ok: false, error: 'Failed to fetch memory bundle', code: 'internal_error' });
  }
});

router.post('/express', guestSessionId, optionalAuth, async (req, res) => {
  const started = Date.now();
  try {
    const { surface, context, assessment, suggestions, options } = req.body ?? {};

    if (!surface || !context || !assessment || !Array.isArray(suggestions) || suggestions.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required fields: surface, context, assessment, suggestions',
        code: 'invalid_input',
      });
    }

    if (!VALID_SURFACES.has(surface)) {
      return res.status(400).json({
        ok: false,
        error: `Invalid surface. Must be one of: ${[...VALID_SURFACES].join(', ')}`,
        code: 'invalid_input',
      });
    }

    const llmResult = await expressWithLlm({ surface, context, assessment, suggestions, options });
    const ms = Date.now() - started;
    recordRouteLatency('intelligence_express', ms);

    if (llmResult) {
      res.set('Deprecation-Replacement', '/api/intelligence/express');
      return res.json({
        ok: true,
        source: 'llm',
        expression: llmResult,
      });
    }

    const fallback = buildFallbackExpression(surface, context, suggestions);
    return res.json({
      ok: true,
      source: 'fallback',
      fallback: true,
      expression: fallback,
    });
  } catch (err) {
    const ms = Date.now() - started;
    recordRouteLatency('intelligence_express', ms, { error: true });
    recordFoundationMetric(
      'intelligence_express_total',
      { source: 'fallback', reason: 'llm_error', surface: req.body?.surface ?? 'unknown' },
      { log: { evt: 'intelligence_express_error', surface: req.body?.surface ?? 'unknown', reason: 'route_exception', ms } },
    );
    console.warn('[intelligence/express] error:', err?.message);
    res.status(500).json({
      ok: false,
      error: 'Expression failed',
      code: 'llm_timeout',
    });
  }
});

export default router;
