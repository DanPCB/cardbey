/**
 * Freesound.org API client — direct search when FREESOUND_API_KEY is set.
 */

import { attachAudioAttestation, buildAudioExternalId } from './audioTypes.js';

const FREESOUND_SEARCH = 'https://freesound.org/apiv2/search/text/';

/**
 * @param {Record<string, unknown>} item
 */
function normalizeFreesoundHit(item) {
  const id = String(item.id ?? '').trim();
  const previews =
    item.previews && typeof item.previews === 'object'
      ? /** @type {Record<string, string>} */ (item.previews)
      : {};
  const previewUrl =
    previews['preview-hq-mp3'] || previews['preview-lq-mp3'] || previews['preview-hq-ogg'] || '';
  if (!id || !previewUrl) return null;

  const tags = Array.isArray(item.tags)
    ? item.tags.map((t) => String(t).trim()).filter(Boolean)
    : [];

  return attachAudioAttestation({
    id: buildAudioExternalId('freesound', id),
    source: 'freesound',
    providerTrackId: id,
    title: String(item.name ?? `Freesound ${id}`).trim(),
    duration: Number.isFinite(Number(item.duration)) ? Math.round(Number(item.duration)) : null,
    genre: null,
    mood: null,
    tags,
    previewUrl,
    downloadUrl: previewUrl,
    attribution: `"${item.name ?? id}" via Freesound`,
    license: String(item.license ?? 'Creative Commons').trim(),
    sourceUrl: typeof item.url === 'string' ? item.url : `https://freesound.org/sounds/${id}/`,
    thumbnailUrl: null,
    metadata: { freesound: { username: item.username ?? null } },
  });
}

/**
 * @param {string} query
 * @param {{ perPage?: number; page?: number }} [options]
 */
export async function searchFreesoundAudio(query, options = {}) {
  const token = process.env.FREESOUND_API_KEY?.trim();
  if (!token) return { tracks: [], total: 0 };

  const perPage = Math.min(20, Math.max(3, Number(options.perPage) || 12));
  const page = Math.max(1, Number(options.page) || 1);
  const params = new URLSearchParams({
    token,
    query: String(query || 'ambient').slice(0, 100),
    fields: 'id,name,url,duration,license,description,tags,previews,username',
    page_size: String(perPage),
    page: String(page),
  });

  const res = await fetch(`${FREESOUND_SEARCH}?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Freesound API error ${res.status}`);
  }
  const data = /** @type {{ results?: unknown[]; count?: number }} */ (await res.json());
  const hits = Array.isArray(data.results) ? data.results : [];
  const tracks = hits
    .filter((h) => h && typeof h === 'object')
    .map((h) => normalizeFreesoundHit(/** @type {Record<string, unknown>} */ (h)))
    .filter(Boolean);
  return { tracks, total: Number(data.count ?? tracks.length) };
}
