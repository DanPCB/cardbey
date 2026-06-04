/**
 * Multi-source video search routes.
 *
 * Mounted at /api/media → exposes GET /api/media/video/search
 *
 * Fans the query out across all registered video source adapters (Pexels,
 * Pixabay, Coverr, Mixkit) via VideoSearchService and returns the merged,
 * normalised VideoResult[] list. Unconfigured sources are skipped silently;
 * a failing source never breaks the others.
 */
import { Router } from 'express';
import {
  searchAllSources,
  listSources,
  listConfiguredSources,
} from '../services/media/VideoSearchService.js';

const router = Router();

/**
 * GET /api/media/video/search?q=<query>&perPage=<n>&sources=pexels,mixkit
 */
router.get('/video/search', async (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const perPage = Math.min(50, Math.max(1, parseInt(req.query.perPage, 10) || 12));
  const sources = typeof req.query.sources === 'string' && req.query.sources.trim()
    ? req.query.sources.split(',').map((s) => s.trim()).filter(Boolean)
    : undefined;

  try {
    const { results, bySource, skipped, errors } = await searchAllSources(query, {
      perPage,
      sources,
    });

    return res.json({
      ok: true,
      query,
      count: results.length,
      sources: {
        registered: listSources(),
        configured: listConfiguredSources(),
        returned: bySource,
        skipped,
        errors,
      },
      results,
    });
  } catch (err) {
    console.error('[mediaVideo] search failed:', err?.message);
    return res.status(500).json({
      ok: false,
      query,
      count: 0,
      results: [],
      error: { code: 'VIDEO_SEARCH_FAILED', message: err?.message || 'Video search failed' },
    });
  }
});

export default router;
