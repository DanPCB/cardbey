/**
 * Cardbey Audio Library API — multi-source search, download, local index.
 * Mount: /api/audio
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { listAudioSourcesForApi } from '../lib/audio/audioSources.js';
import { audioService } from '../lib/audio/audioService.js';
import { listLocalAudioLibrary } from '../lib/audio/audioLibraryPersistence.js';
import { emitPlatformActivity } from '../lib/platformActivity/platformActivityEmitter.js';

const router = Router();

/** GET /api/audio/sources */
router.get('/sources', requireAuth, (_req, res) => {
  return res.json({ ok: true, sources: listAudioSourcesForApi() });
});

/** GET /api/audio/search?q=&source=all|pixabay|... */
router.get('/search', requireAuth, async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const source = typeof req.query.source === 'string' ? req.query.source : 'all';
  const limit = req.query.limit != null ? Number(req.query.limit) : 20;

  if (!q) {
    return res.status(400).json({ ok: false, message: 'q is required' });
  }

  try {
    const { results, total } = await audioService.search(q, source, limit);

    void Promise.resolve(
      emitPlatformActivity({
        type: 'audio_library_search',
        severity: 'info',
        actorType: 'user',
        actorId: req.user?.id ?? null,
        entityType: 'audio',
        entityId: source,
        title: 'Audio library search',
        message: `Audio search: "${q}" (${results.length} results)`,
        metadata: { query: q, source, count: results.length },
      }),
    ).catch(() => {});

    return res.json({ ok: true, query: q, source, total, results });
  } catch (err) {
    console.error('[audio/search]', err?.message || err);
    return res.status(502).json({
      ok: false,
      message: err?.message || 'Audio search failed',
      results: [],
    });
  }
});

/** GET /api/audio/library — browse Cardbey-hosted library */
router.get('/library', requireAuth, async (req, res) => {
  const source = typeof req.query.source === 'string' ? req.query.source : null;
  const limit = req.query.limit != null ? Number(req.query.limit) : 40;
  try {
    const results = await listLocalAudioLibrary({ source, limit });
    return res.json({ ok: true, results, total: results.length });
  } catch (err) {
    return res.status(502).json({ ok: false, message: err?.message || 'Library load failed' });
  }
});

/** GET /api/audio/track/:trackId */
router.get('/track/:trackId', requireAuth, async (req, res) => {
  try {
    const source = typeof req.query.source === 'string' ? req.query.source : undefined;
    const track = await audioService.getTrack(req.params.trackId, source);
    if (!track) {
      return res.status(404).json({ ok: false, message: 'Track not found' });
    }
    return res.json({ ok: true, track });
  } catch (err) {
    return res.status(502).json({ ok: false, message: err?.message || 'Track lookup failed' });
  }
});

/** POST /api/audio/download — import remote track to Cardbey storage + index */
router.post('/download', requireAuth, async (req, res) => {
  const body = req.body?.audio ?? req.body?.track ?? req.body;
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ ok: false, message: 'audio track payload is required' });
  }

  const ownerUserId = req.user?.id;
  if (!ownerUserId) {
    return res.status(401).json({ ok: false, message: 'Authentication required' });
  }

  try {
    const saved = await audioService.importTrackToLibrary(body, {
      storeId: req.body?.storeId ?? null,
      uploadedBy: ownerUserId,
    });

    void Promise.resolve(
      emitPlatformActivity({
        type: 'audio_library_import',
        severity: 'info',
        actorType: 'user',
        actorId: ownerUserId,
        entityType: 'audio',
        entityId: saved.id,
        title: 'Audio imported to library',
        message: `${saved.title} saved to Cardbey library`,
        metadata: {
          source: saved.source,
          trackId: saved.providerTrackId,
          storeId: req.body?.storeId ?? null,
        },
      }),
    ).catch(() => {});

    return res.status(201).json({ ok: true, success: true, track: saved });
  } catch (err) {
    console.error('[audio/download]', err?.message || err);
    return res.status(502).json({
      ok: false,
      success: false,
      message: err?.message || 'Audio download failed',
    });
  }
});

export default router;
