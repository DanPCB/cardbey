/**
 * Intelligence Foundation API
 * GET  /api/intelligence/health
 * POST /api/intelligence/memory
 * POST /api/intelligence/express
 */
import { Router } from 'express';
import { optionalAuth } from '../middleware/auth.js';
import { guestSessionId } from '../middleware/guestSession.js';
import { fetchMemoryBundle } from '../lib/intelligence/memoryAdapter.js';
import { expressWithLlm, isIntelligenceLlmAvailable } from '../lib/intelligence/expressWithLlm.js';
import { getLlmMetricsSnapshot } from '../lib/intelligence/llmMonitor.js';

const router = Router();

const VALID_SURFACES = new Set(['pil', 'briefing', 'smart_object', 'discover']);

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

router.get('/metrics', (_req, res) => {
  res.json({
    ok: true,
    ...getLlmMetricsSnapshot(),
  });
});

router.post('/memory', guestSessionId, optionalAuth, async (req, res) => {
  try {
    const { actor, storeId, sessionId, sessionHints } = req.body ?? {};
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
      ownerId,
    });

    res.json(bundle);
  } catch (err) {
    console.warn('[intelligence/memory] error:', err?.message);
    res.status(500).json({ ok: false, error: 'Failed to fetch memory bundle', code: 'internal_error' });
  }
});

router.post('/express', guestSessionId, optionalAuth, async (req, res) => {
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
    console.warn('[intelligence/express] error:', err?.message);
    res.status(500).json({
      ok: false,
      error: 'Expression failed',
      code: 'llm_timeout',
    });
  }
});

export default router;
