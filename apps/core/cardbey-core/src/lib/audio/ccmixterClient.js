/**
 * ccMixter API — CC-licensed remixes and samples.
 * Falls back to Openverse with source=ccmixter when direct API is sparse.
 */

import { attachAudioAttestation, buildAudioExternalId } from './audioTypes.js';

const CCMIXTER_QUERY = 'https://ccmixter.org/api/query';

/**
 * @param {Record<string, unknown>} item
 */
function normalizeCcmixterHit(item) {
  const id = String(item.upload_id ?? item.tid ?? item.id ?? '').trim();
  const downloadUrl =
    (typeof item.download_url === 'string' && item.download_url.trim()) ||
    (typeof item.files?.[0]?.file_url === 'string' && item.files[0].file_url.trim()) ||
    (typeof item.mp3 === 'string' && item.mp3.trim()) ||
    '';
  if (!id || !downloadUrl) return null;

  const title = String(item.upload_name ?? item.title ?? `ccMixter ${id}`).trim();
  const tags = Array.isArray(item.tags)
    ? item.tags.map((t) => String(t).trim()).filter(Boolean)
    : typeof item.tags === 'string'
      ? item.tags.split(',').map((t) => t.trim()).filter(Boolean)
      : [];

  return attachAudioAttestation({
    id: buildAudioExternalId('ccmixter', id),
    source: 'ccmixter',
    providerTrackId: id,
    title,
    duration: null,
    genre: null,
    mood: null,
    tags,
    previewUrl: downloadUrl,
    downloadUrl,
    attribution: `"${title}" via ccMixter — ${item.user_real_name ?? item.login ?? 'Unknown'}`,
    license: String(item.license_name ?? 'Creative Commons').trim(),
    sourceUrl:
      (typeof item.permalink === 'string' && item.permalink.trim()) ||
      `https://ccmixter.org/files/${item.login ?? 'unknown'}/${id}`,
    thumbnailUrl: typeof item.userpicURL === 'string' ? item.userpicURL : null,
    metadata: { ccmixter: { login: item.login ?? null } },
  });
}

/**
 * @param {string} query
 * @param {{ perPage?: number; page?: number }} [options]
 */
export async function searchCcmixterAudio(query, options = {}) {
  const limit = Math.min(20, Math.max(3, Number(options.perPage) || 12));
  const offset = Math.max(0, ((Number(options.page) || 1) - 1) * limit);
  const params = new URLSearchParams({
    f: 'json',
    t: 'search',
    search: String(query || 'ambient').slice(0, 100),
    limit: String(limit),
    offset: String(offset),
    lic: 'by,by-sa,sampling+plus,plus',
  });

  try {
    const res = await fetch(`${CCMIXTER_QUERY}?${params.toString()}`);
    if (!res.ok) return { tracks: [], total: 0 };
    const data = /** @type {unknown} */ (await res.json());
    const hits = Array.isArray(data)
      ? data
      : Array.isArray(/** @type {{ results?: unknown[] }} */ (data).results)
        ? /** @type {{ results: unknown[] }} */ (data).results
        : [];
    const tracks = hits
      .filter((h) => h && typeof h === 'object')
      .map((h) => normalizeCcmixterHit(/** @type {Record<string, unknown>} */ (h)))
      .filter(Boolean);
    return { tracks, total: tracks.length };
  } catch {
    return { tracks: [], total: 0 };
  }
}
