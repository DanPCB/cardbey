/**
 * Unified music library search.
 * Pixabay's public REST API only documents images + videos — not music tracks.
 * When Pixabay audio endpoints fail or return no hits, fall back to Openverse audio.
 */

import { isPixabayMusicEnabled } from './musicLicensePolicy.js';
import type { NormalizedMusicTrack } from './musicLicensePolicy.js';
import { searchOpenverseMusic, getOpenverseTrackById } from './openverseMusicClient.js';
import { searchPixabayMusicFromApi, getPixabayTrackByIdFromApi } from './pixabayMusicClient.js';

export type MusicSearchCatalog = 'pixabay' | 'openverse';

export type MusicSearchResult = {
  tracks: NormalizedMusicTrack[];
  total: number;
  catalog: MusicSearchCatalog;
  catalogNote?: string;
};

const OPENVERSE_FALLBACK_NOTE =
  'Pixabay does not expose music through its public API. Showing licensed audio from Openverse (Jamendo, Freesound, and similar sources).';

export async function searchMusicLibrary(
  query: string,
  options: {
    category?: string;
    mood?: string;
    duration?: number;
    perPage?: number;
    page?: number;
    audioType?: string;
  } = {},
): Promise<MusicSearchResult> {
  if (isPixabayMusicEnabled()) {
    try {
      const pixabay = await searchPixabayMusicFromApi(query, options);
      if (pixabay.tracks.length > 0) {
        return { ...pixabay, catalog: 'pixabay' };
      }
    } catch {
      // fall through to Openverse
    }
  }

  const openverse = await searchOpenverseMusic(query, {
    perPage: options.perPage,
    page: options.page,
  });
  return {
    ...openverse,
    catalog: 'openverse',
    catalogNote: OPENVERSE_FALLBACK_NOTE,
  };
}

export async function getMusicTrackById(trackId: string): Promise<NormalizedMusicTrack | null> {
  const id = String(trackId ?? '').trim();
  if (!id) return null;

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    const openverse = await getOpenverseTrackById(id);
    if (openverse) return openverse;
  }

  if (isPixabayMusicEnabled()) {
    try {
      const pixabay = await getPixabayTrackByIdFromApi(id);
      if (pixabay) return pixabay;
    } catch {
      // ignore
    }
  }

  return getOpenverseTrackById(id);
}
