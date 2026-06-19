/**
 * Pixabay Music API routes — governed search/select (no publish).
 * Mount: /api/music
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  assertPixabayMusicConfigured,
  isAllowedMusicTrack,
} from '../lib/music/musicLicensePolicy.js';
import {
  buildMusicSearchQuery,
  getPixabayTrackById,
  searchPixabayMusic,
} from '../lib/music/pixabayMusicClient.js';
import { storeSelectedMusicTrack } from '../lib/music/selectedMusicAssetService.js';
import { emitPlatformActivity } from '../lib/platformActivity/platformActivityEmitter.js';

const router = Router();

function disabledResponse(res) {
  const gate = assertPixabayMusicConfigured();
  return res.status(503).json({
    ok: false,
    enabled: false,
    code: gate.ok ? 'PIXABAY_MUSIC_DISABLED' : gate.code,
    message: gate.ok ? 'Pixabay music is disabled.' : gate.message,
    tracks: [],
  });
}

/** GET /api/music/pixabay/search */
router.get('/pixabay/search', requireAuth, async (req, res) => {
  const gate = assertPixabayMusicConfigured();
  if (!gate.ok) return disabledResponse(res);

  const q =
    String(req.query.q ?? '').trim() ||
    buildMusicSearchQuery({
      businessVertical: typeof req.query.businessVertical === 'string' ? req.query.businessVertical : null,
      mood: typeof req.query.mood === 'string' ? req.query.mood : null,
      objective: typeof req.query.objective === 'string' ? req.query.objective : null,
      query: typeof req.query.q === 'string' ? req.query.q : null,
    });

  try {
    const { tracks, total } = await searchPixabayMusic(q, {
      category: typeof req.query.category === 'string' ? req.query.category : undefined,
      mood: typeof req.query.mood === 'string' ? req.query.mood : undefined,
      duration: req.query.duration != null ? Number(req.query.duration) : undefined,
      perPage: req.query.per_page != null ? Number(req.query.per_page) : Number(req.query.perPage) || 12,
      page: req.query.page != null ? Number(req.query.page) : 1,
    });

    void Promise.resolve(
      emitPlatformActivity({
        type: 'music_search_performed',
        severity: 'info',
        actorType: 'user',
        actorId: req.user?.id ?? null,
        entityType: 'music',
        entityId: 'pixabay',
        title: 'Music search performed',
        message: `Pixabay search: "${q}" (${tracks.length} tracks)`,
        metadata: { provider: 'pixabay', query: q, count: tracks.length },
      }),
    ).catch(() => {});

    return res.json({ ok: true, enabled: true, query: q, total, tracks });
  } catch (err) {
    console.error('[music/pixabay/search]', err?.message || err);
    return res.status(502).json({
      ok: false,
      enabled: true,
      query: q,
      tracks: [],
      error: { code: 'PIXABAY_SEARCH_FAILED', message: err?.message || 'Search failed' },
    });
  }
});

/** GET /api/music/pixabay/:trackId */
router.get('/pixabay/:trackId', requireAuth, async (req, res) => {
  const gate = assertPixabayMusicConfigured();
  if (!gate.ok) return disabledResponse(res);

  try {
    const track = await getPixabayTrackById(req.params.trackId);
    if (!track || !isAllowedMusicTrack(track)) {
      return res.status(404).json({ ok: false, message: 'Track not found or not licensed for use.' });
    }
    return res.json({ ok: true, track });
  } catch (err) {
    return res.status(502).json({
      ok: false,
      error: { code: 'PIXABAY_TRACK_FAILED', message: err?.message || 'Lookup failed' },
    });
  }
});

/** POST /api/music/pixabay/select — stores metadata only; does not publish */
router.post('/pixabay/select', requireAuth, async (req, res) => {
  const gate = assertPixabayMusicConfigured();
  if (!gate.ok) return disabledResponse(res);

  const trackId = String(req.body?.providerTrackId ?? req.body?.trackId ?? '').trim();
  if (!trackId) {
    return res.status(400).json({ ok: false, message: 'providerTrackId is required.' });
  }

  try {
    const track = await getPixabayTrackById(trackId);
    if (!track || !isAllowedMusicTrack(track)) {
      return res.status(400).json({ ok: false, message: 'Track missing license or audio URL.' });
    }

    const ownerUserId = req.user?.id;
    if (!ownerUserId) {
      return res.status(401).json({ ok: false, message: 'Authentication required.' });
    }

    const stored = await storeSelectedMusicTrack(track, {
      ownerUserId,
      storeId: req.body?.storeId ?? null,
      campaignId: req.body?.campaignId ?? null,
      missionId: req.body?.missionId ?? null,
      selectedFor: req.body?.selectedFor ?? 'music_library',
    });

    if (!stored.ok) {
      return res.status(400).json({ ok: false, message: stored.message });
    }

    void Promise.resolve(
      emitPlatformActivity({
        type: 'music_track_selected',
        severity: 'info',
        actorType: 'user',
        actorId: ownerUserId,
        entityType: 'music',
        entityId: track.providerTrackId,
        title: 'Music track selected',
        message: `${track.title} selected from Pixabay`,
        metadata: {
          provider: 'pixabay',
          trackId: track.providerTrackId,
          storeId: req.body?.storeId ?? null,
          campaignId: req.body?.campaignId ?? null,
          missionId: req.body?.missionId ?? null,
          license: track.license,
        },
      }),
    ).catch(() => {});

    return res.json({
      ok: true,
      asset: stored.asset,
      suitcaseItemId: stored.suitcaseItemId,
    });
  } catch (err) {
    return res.status(502).json({
      ok: false,
      error: { code: 'PIXABAY_SELECT_FAILED', message: err?.message || 'Select failed' },
    });
  }
});

export default router;
