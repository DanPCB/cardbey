/**
 * Admin-only routes (requireAuth + requireAdmin).
 * GET /api/admin/llm/health - LLM provider health (Kimi disabled state, etc.)
 */

import express from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuth);
router.use(requireAdmin);

router.get('/llm/health', async (req, res) => {
  try {
    const { health } = await import('../lib/llm/kimiProvider.js');
    const result = await health();
    const status = result.ok ? 200 : 503;
    res.status(status).json({
      ok: result.ok,
      provider: 'kimi',
      disabled: result.disabled ?? false,
      error: result.error ?? null,
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      provider: 'kimi',
      disabled: false,
      error: e?.message ?? String(e),
    });
  }
});

export default router;
