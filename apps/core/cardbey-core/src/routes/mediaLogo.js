/**
 * Logo search + AI generation routes.
 * Mounted at /api/media → GET /api/media/logo/search, POST /api/media/logo/generate
 */
import { Router } from 'express';
import {
  searchAllSources,
  listSources,
  listConfiguredSources,
} from '../services/logo/LogoSearchService.js';
import { generate as generateLogo } from '../services/logo/LogoGenerationService.js';

const router = Router();

/**
 * GET /api/media/logo/search?q=<query>
 */
router.get('/logo/search', async (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';

  try {
    const { results, bySource, skipped, errors } = await searchAllSources(query);

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
    console.error('[mediaLogo] search failed:', err?.message);
    return res.status(500).json({
      ok: false,
      query,
      count: 0,
      results: [],
      error: { code: 'LOGO_SEARCH_FAILED', message: err?.message || 'Logo search failed' },
    });
  }
});

/**
 * POST /api/media/logo/generate
 */
router.post('/logo/generate', async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const storeName = typeof body.storeName === 'string' ? body.storeName.trim() : '';

  if (!storeName) {
    return res.status(400).json({
      ok: false,
      error: { code: 'MISSING_STORE_NAME', message: 'storeName is required' },
    });
  }

  const params = {
    storeName,
    industry: typeof body.industry === 'string' ? body.industry.trim() : 'business',
    style: typeof body.style === 'string' ? body.style.trim() : 'auto',
    colors: typeof body.colors === 'string' ? body.colors.trim() : '',
    description: typeof body.description === 'string' ? body.description.trim() : '',
  };

  const preferredSource =
    typeof body.source === 'string' && body.source.trim()
      ? body.source.trim().toLowerCase()
      : 'auto';

  try {
    const outcome = await generateLogo(params, preferredSource);

    if (!outcome.ok || !outcome.result) {
      return res.status(outcome.error?.code === 'LOGO_GENERATION_NOT_CONFIGURED' ? 503 : 502).json({
        ok: false,
        tried: outcome.tried,
        errors: outcome.errors,
        error: outcome.error || {
          code: 'LOGO_GENERATION_FAILED',
          message: 'Logo generation failed',
        },
      });
    }

    return res.json({
      ok: true,
      result: outcome.result,
      source: outcome.source,
    });
  } catch (err) {
    console.error('[mediaLogo] generate failed:', err?.message);
    return res.status(500).json({
      ok: false,
      error: { code: 'LOGO_GENERATION_FAILED', message: err?.message || 'Logo generation failed' },
    });
  }
});

export default router;
