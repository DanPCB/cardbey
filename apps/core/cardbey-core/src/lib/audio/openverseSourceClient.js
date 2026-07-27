/**
 * Openverse audio search filtered by upstream provider (Jamendo, Freesound, ccMixter).
 */

import { musicTrackToAudioTrack } from './audioTypes.js';
import { loadOpenverseMusicClient } from './audioMusicBridge.js';

const OPENVERSE_AUDIO_URL = 'https://api.openverse.org/v1/audio/';

/**
 * @param {string} query
 * @param {string} openverseSource e.g. jamendo, freesound, ccmixter
 * @param {{ perPage?: number; page?: number }} [options]
 */
export async function searchOpenverseByProvider(query, openverseSource, options = {}) {
  const perPage = Math.min(20, Math.max(3, Number(options.perPage) || 12));
  const page = Math.max(1, Number(options.page) || 1);
  const params = new URLSearchParams({
    q: String(query || 'background music').slice(0, 100),
    page_size: String(perPage),
    page: String(page),
    source: String(openverseSource).trim(),
  });

  const res = await fetch(`${OPENVERSE_AUDIO_URL}?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Openverse audio API error ${res.status}`);
  }
  const data = /** @type {{ results?: unknown[]; result_count?: number }} */ (await res.json());
  const hits = Array.isArray(data.results)
    ? data.results.filter((h) => Boolean(h) && typeof h === 'object')
    : [];

  const { normalizeOpenverseMusicResult } = await loadOpenverseMusicClient();
  const { filterAllowedMusicTracks } = await import('../music/musicLicensePolicy.ts');

  const musicTracks = filterAllowedMusicTracks(
    hits
      .map((h) => normalizeOpenverseMusicResult(/** @type {Record<string, unknown>} */ (h)))
      .filter((t) => t != null),
  );
  const tracks = musicTracks.map((t) => musicTrackToAudioTrack(t, openverseSource));
  return { tracks, total: Number(data.result_count ?? tracks.length) };
}
