/**
 * Layout Engine API — universal layout transformation.
 */

import { Router } from 'express';
import { LayoutEngine, LAYOUT_TYPES } from '../lib/layout/layoutEngine.js';
import { rateLimitMiddleware } from '../services/reliability/rateLimitMiddleware.js';

const router = Router();
const engine = new LayoutEngine();

const layoutRateLimit = rateLimitMiddleware({
  endpoint: '/api/layout/apply',
  windowMs: 60_000,
  maxRequests: 30,
  perUser: false,
});

/**
 * POST /api/layout/apply
 * Apply layout to content.
 */
router.post('/apply', layoutRateLimit, async (req, res) => {
  try {
    const content = req.body?.content;
    const type = req.body?.type ?? null;
    const options = req.body?.options && typeof req.body.options === 'object' ? req.body.options : {};

    if (!content || typeof content !== 'string') {
      return res.status(400).json({ success: false, error: 'Content is required' });
    }

    if (content.length > 500_000) {
      return res.status(413).json({ success: false, error: 'Content exceeds 500KB limit' });
    }

    if (type && !LAYOUT_TYPES.includes(type)) {
      return res.status(400).json({
        success: false,
        error: `Invalid type. Supported: ${LAYOUT_TYPES.join(', ')}`,
      });
    }

    const result = await engine.applyLayout(content, type, options);

    res.json({
      success: true,
      type: result.type,
      processed: result.processed,
      stats: result.stats,
      suggestedActions: result.suggestedActions,
      original: result.original,
    });
  } catch (error) {
    console.error('[LayoutEngine] Error:', error);
    res.status(500).json({ success: false, error: error?.message || 'layout_apply_failed' });
  }
});

/**
 * GET /api/layout/types
 * Get supported layout types.
 */
router.get('/types', (_req, res) => {
  res.json({
    success: true,
    types: LAYOUT_TYPES,
  });
});

export default router;
