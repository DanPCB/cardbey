/**
 * Public Places photo proxy — serves placeId-bound Google Places photos
 * without exposing API keys in browser <img> src.
 *
 * GET /api/public/places-photo?photoName=places%2F...%2Fphotos%2F...
 * GET /api/public/places-photo?photoReference=...&placeId=...
 */

import express from 'express';

const router = express.Router();

function placesKey(): string | null {
  return (
    process.env.GOOGLE_PLACES_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    null
  );
}

function placeIdFromPhotoName(photoName: string): string | null {
  const m = /^places\/([^/]+)\/photos\//i.exec(photoName.trim());
  return m?.[1] ?? null;
}

router.get('/places-photo', async (req, res) => {
  const key = placesKey();
  if (!key) {
    return res.status(503).json({ error: 'places_photo_unavailable' });
  }

  const photoName =
    typeof req.query.photoName === 'string' ? req.query.photoName.trim() : '';
  const photoReference =
    typeof req.query.photoReference === 'string' ? req.query.photoReference.trim() : '';
  const placeId =
    typeof req.query.placeId === 'string' ? req.query.placeId.trim() : '';
  const max = Math.min(
    1600,
    Math.max(200, Number.parseInt(String(req.query.max ?? '1200'), 10) || 1200),
  );

  try {
    let upstream: Response | null = null;

    if (photoName.includes('/photos/')) {
      const embeddedPlaceId = placeIdFromPhotoName(photoName);
      if (placeId && embeddedPlaceId && embeddedPlaceId !== placeId) {
        return res.status(400).json({ error: 'place_id_mismatch' });
      }
      const url = `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=${max}&maxWidthPx=${max}&skipHttpRedirect=false`;
      upstream = await fetch(url, {
        headers: { 'X-Goog-Api-Key': key },
        signal: AbortSignal.timeout(12000),
        redirect: 'follow',
      });
    } else if (photoReference && placeId) {
      // Legacy Places Photo — placeId required so we never serve an unbound ref.
      const url =
        `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${max}` +
        `&photo_reference=${encodeURIComponent(photoReference)}` +
        `&key=${encodeURIComponent(key)}`;
      upstream = await fetch(url, {
        signal: AbortSignal.timeout(12000),
        redirect: 'follow',
      });
    } else {
      return res.status(400).json({ error: 'photoName_or_photoReference_required' });
    }

    if (!upstream || !upstream.ok) {
      return res.status(upstream?.status === 404 ? 404 : 502).json({
        error: 'places_photo_fetch_failed',
        status: upstream?.status ?? null,
      });
    }

    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      return res.status(502).json({ error: 'places_photo_not_image' });
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    res.setHeader('X-Cardbey-Places-Photo', '1');
    const buf = Buffer.from(await upstream.arrayBuffer());
    return res.status(200).send(buf);
  } catch (err) {
    console.warn(
      '[places-photo] proxy failed:',
      err instanceof Error ? err.message : err,
    );
    return res.status(502).json({ error: 'places_photo_proxy_error' });
  }
});

export default router;
