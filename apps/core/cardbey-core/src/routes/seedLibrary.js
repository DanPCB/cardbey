/**
 * Seed Library API: placeholder image for fallback (hero, item card).
 * Key-based selection only; no index-based logic.
 */

import { Router } from 'express';
import { getSeedImageForCategory } from '../lib/seedLibrary/getSeedImageForCategory.js';

const router = Router();

/**
 * GET /api/seed-library/placeholder
 * Query: vertical, categoryKey?, orientation?
 * Returns { url: string | null, source: 'seed_library' | null }
 */
router.get('/seed-library/placeholder', async (req, res) => {
  try {
    const vertical = req.query.vertical ?? null;
    const categoryKey = req.query.categoryKey ?? null;
    const orientation = req.query.orientation ?? null;
    const url = await getSeedImageForCategory({ categoryKey, vertical, orientation });
    res.json({ url: url ?? null, source: url ? 'seed_library' : null });
  } catch (err) {
    console.warn('[seed-library] placeholder error:', err?.message || err);
    res.status(500).json({ url: null, source: null });
  }
});

export default router;
