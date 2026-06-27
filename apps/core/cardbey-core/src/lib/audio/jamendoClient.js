/**
 * Jamendo Music API v3 — full-length CC tracks when JAMENDO_CLIENT_ID is set.
 */

import { attachAudioAttestation, buildAudioExternalId } from './audioTypes.js';

const JAMENDO_TRACKS = 'https://api.jamendo.com/v3.0/tracks/';

/**
 * @param {Record<string, unknown>} item
 */
function normalizeJamendoHit(item) {
  const id = String(item.id ?? '').trim();
  const audio =
    (typeof item.audio === 'string' && item.audio.trim()) ||
    (typeof item.audiodownload === 'string' && item.audiodownload.trim()) ||
    '';
  if (!id || !audio) return null;

  const title = String(item.name ?? item.title ?? `Jamendo ${id}`).trim();
  const duration = Number(item.duration);
  const tags = typeof item.tags === 'string'
    ? item.tags.split(/\s+/).map((t) => t.trim()).filter(Boolean)
    : [];

  return attachAudioAttestation({
    id: buildAudioExternalId('jamendo', id),
    source: 'jamendo',
    providerTrackId: id,
    title,
    duration: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : null,
    genre: typeof item.musicinfo?.tags?.genres === 'object'
      ? Object.keys(/** @type {Record<string, unknown>} */ (item.musicinfo.tags.genres))[0] ?? null
      : null,
    mood: null,
    tags,
    previewUrl: audio,
    downloadUrl: audio,
    attribution: `"${title}" via Jamendo — ${item.artist_name ?? 'Unknown artist'}`,
    license: String(item.license_ccurl ? 'Creative Commons' : item.license ?? 'Creative Commons').trim(),
    sourceUrl:
      (typeof item.shareurl === 'string' && item.shareurl.trim()) ||
      `https://www.jamendo.com/track/${id}`,
    thumbnailUrl: typeof item.image === 'string' ? item.image : null,
    metadata: {
      jamendo: {
        artist: item.artist_name ?? null,
        album: item.album_name ?? null,
      },
    },
  });
}

/**
 * @param {string} query
 * @param {{ perPage?: number; page?: number }} [options]
 */
export async function searchJamendoAudio(query, options = {}) {
  const clientId = process.env.JAMENDO_CLIENT_ID?.trim();
  if (!clientId) return { tracks: [], total: 0 };

  const limit = Math.min(20, Math.max(3, Number(options.perPage) || 12));
  const offset = Math.max(0, ((Number(options.page) || 1) - 1) * limit);
  const params = new URLSearchParams({
    client_id: clientId,
    format: 'json',
    limit: String(limit),
    offset: String(offset),
    search: String(query || 'background music').slice(0, 100),
    include: 'musicinfo',
    audioformat: 'mp32',
  });

  const res = await fetch(`${JAMENDO_TRACKS}?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Jamendo API error ${res.status}`);
  }
  const data = /** @type {{ results?: unknown[]; headers?: { results_count?: number } }} */ (
    await res.json()
  );
  const hits = Array.isArray(data.results) ? data.results : [];
  const tracks = hits
    .filter((h) => h && typeof h === 'object')
    .map((h) => normalizeJamendoHit(/** @type {Record<string, unknown>} */ (h)))
    .filter(Boolean);
  const total = Number(data.headers?.results_count ?? tracks.length);
  return { tracks, total };
}

/**
 * @param {string} trackId
 */
export async function getJamendoTrackById(trackId) {
  const clientId = process.env.JAMENDO_CLIENT_ID?.trim();
  const id = String(trackId ?? '').trim();
  if (!clientId || !id) return null;

  const params = new URLSearchParams({
    client_id: clientId,
    format: 'json',
    id,
    include: 'musicinfo',
    audioformat: 'mp32',
  });
  const res = await fetch(`${JAMENDO_TRACKS}?${params.toString()}`);
  if (!res.ok) return null;
  const data = /** @type {{ results?: unknown[] }} */ (await res.json());
  const hit = Array.isArray(data.results) ? data.results[0] : null;
  if (!hit || typeof hit !== 'object') return null;
  return normalizeJamendoHit(/** @type {Record<string, unknown>} */ (hit));
}
