/**
 * Pixabay Music API client — governed media capability.
 * API: GET https://pixabay.com/api/audio/ (beta; falls back to /api/music/)
 */

import {
  attachMusicAttestation,
  filterAllowedMusicTracks,
  PIXABAY_MUSIC_LICENSE,
  type NormalizedMusicTrack,
} from './musicLicensePolicy.js';

export type PixabayMusicSearchOptions = {
  category?: string;
  mood?: string;
  duration?: number;
  perPage?: number;
  page?: number;
  audioType?: string;
};

const PRIMARY_AUDIO_URL = 'https://pixabay.com/api/audio/';
const FALLBACK_AUDIO_URL = 'https://pixabay.com/api/music/';

function pickAudioUrl(hit: Record<string, unknown>): string | null {
  const candidates = [
    hit.audio,
    hit.audioURL,
    hit.audioUrl,
    hit.downloadURL,
    hit.downloadUrl,
    hit.previewURL,
    hit.previewUrl,
    hit.webformatURL,
    hit.url,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().startsWith('http')) return c.trim();
  }
  const audioObj = hit.audio && typeof hit.audio === 'object' ? (hit.audio as Record<string, unknown>) : null;
  if (audioObj) {
    for (const key of ['url', 'preview', 'download', 'medium', 'large']) {
      const v = audioObj[key];
      if (typeof v === 'string' && v.trim().startsWith('http')) return v.trim();
    }
  }
  return null;
}

function pickPreviewUrl(hit: Record<string, unknown>, downloadUrl: string | null): string {
  const preview =
    (typeof hit.previewURL === 'string' && hit.previewURL) ||
    (typeof hit.previewUrl === 'string' && hit.previewUrl) ||
    downloadUrl;
  return preview?.trim() || '';
}

export function normalizePixabayMusicResult(hit: Record<string, unknown>): NormalizedMusicTrack | null {
  const id = String(hit.id ?? '').trim();
  if (!id) return null;

  const downloadUrl = pickAudioUrl(hit);
  const previewUrl = pickPreviewUrl(hit, downloadUrl);
  if (!previewUrl && !downloadUrl) return null;

  const tagsRaw = hit.tags;
  const tags =
    typeof tagsRaw === 'string'
      ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean)
      : Array.isArray(tagsRaw)
        ? tagsRaw.map((t) => String(t).trim()).filter(Boolean)
        : [];

  const title =
    (typeof hit.title === 'string' && hit.title.trim()) ||
    (typeof hit.name === 'string' && hit.name.trim()) ||
    (tags[0] ? tags[0] : `Pixabay track ${id}`);

  const user = typeof hit.user === 'string' ? hit.user.trim() : '';
  const pageURL = typeof hit.pageURL === 'string' ? hit.pageURL.trim() : `https://pixabay.com/music/search/${encodeURIComponent(title)}/`;

  const track: NormalizedMusicTrack = {
    provider: 'pixabay',
    providerTrackId: id,
    title,
    duration: Number.isFinite(Number(hit.duration)) ? Number(hit.duration) : null,
    genre: typeof hit.genre === 'string' ? hit.genre : typeof hit.category === 'string' ? hit.category : null,
    mood: typeof hit.mood === 'string' ? hit.mood : null,
    tags,
    previewUrl: previewUrl || downloadUrl || '',
    downloadUrl: downloadUrl || previewUrl || '',
    attribution: user ? `Music by ${user} on Pixabay` : 'Music from Pixabay',
    license: PIXABAY_MUSIC_LICENSE,
    sourceUrl: pageURL,
    thumbnailUrl:
      (typeof hit.userImageURL === 'string' && hit.userImageURL) ||
      (typeof hit.thumbnail === 'string' && hit.thumbnail) ||
      null,
    metadata: {
      pixabay: {
        pageURL,
        user,
        userId: hit.user_id ?? null,
        downloads: hit.downloads ?? null,
        likes: hit.likes ?? null,
      },
    },
  };

  return attachMusicAttestation(track);
}

async function fetchPixabayAudio(
  baseUrl: string,
  params: URLSearchParams,
): Promise<{ hits: Record<string, unknown>[]; total: number }> {
  const res = await fetch(`${baseUrl}?${params.toString()}`, { method: 'GET' });
  if (!res.ok) {
    throw new Error(`Pixabay audio API error ${res.status}`);
  }
  const data = (await res.json()) as { hits?: unknown[]; total?: number; totalHits?: number };
  const hits = Array.isArray(data?.hits)
    ? data.hits.filter((h): h is Record<string, unknown> => Boolean(h) && typeof h === 'object')
    : [];
  return { hits, total: Number(data?.totalHits ?? data?.total ?? hits.length) };
}

export async function searchPixabayMusicFromApi(
  query: string,
  options: PixabayMusicSearchOptions = {},
): Promise<{ tracks: NormalizedMusicTrack[]; total: number }> {
  const apiKey = process.env.PIXABAY_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('PIXABAY_API_KEY is not configured');
  }

  const perPage = Math.min(50, Math.max(3, Number(options.perPage) || 12));
  const page = Math.max(1, Number(options.page) || 1);
  const params = new URLSearchParams({
    key: apiKey,
    q: String(query || '').slice(0, 100),
    audio_type: String(options.audioType || 'music'),
    per_page: String(perPage),
    page: String(page),
  });
  if (options.category?.trim()) params.set('category', options.category.trim());
  if (options.mood?.trim()) params.set('mood', options.mood.trim());
  if (options.duration != null && Number.isFinite(options.duration)) {
    params.set('duration', String(Math.floor(options.duration)));
  }

  let hits: Record<string, unknown>[] = [];
  let total = 0;
  try {
    const primary = await fetchPixabayAudio(PRIMARY_AUDIO_URL, params);
    hits = primary.hits;
    total = primary.total;
  } catch {
    const fallback = await fetchPixabayAudio(FALLBACK_AUDIO_URL, params);
    hits = fallback.hits;
    total = fallback.total;
  }

  const tracks = filterAllowedMusicTracks(
    hits.map(normalizePixabayMusicResult).filter((t): t is NormalizedMusicTrack => t != null),
  );
  return { tracks, total };
}

/** Search with Openverse fallback when Pixabay audio API is unavailable. */
export async function searchPixabayMusic(
  query: string,
  options: PixabayMusicSearchOptions = {},
): Promise<{ tracks: NormalizedMusicTrack[]; total: number; catalog?: string; catalogNote?: string }> {
  const { searchMusicLibrary } = await import('./musicSearchService.js');
  const result = await searchMusicLibrary(query, options);
  return {
    tracks: result.tracks,
    total: result.total,
    catalog: result.catalog,
    catalogNote: result.catalogNote,
  };
}

export async function getPixabayTrackById(trackId: string): Promise<NormalizedMusicTrack | null> {
  const { getMusicTrackById } = await import('./musicSearchService.js');
  return getMusicTrackById(trackId);
}

export async function getPixabayTrackByIdFromApi(trackId: string): Promise<NormalizedMusicTrack | null> {
  const apiKey = process.env.PIXABAY_API_KEY?.trim();
  if (!apiKey) throw new Error('PIXABAY_API_KEY is not configured');

  const id = String(trackId ?? '').trim();
  if (!id) return null;

  const params = new URLSearchParams({ key: apiKey, id });
  for (const baseUrl of [PRIMARY_AUDIO_URL, FALLBACK_AUDIO_URL]) {
    try {
      const { hits } = await fetchPixabayAudio(baseUrl, params);
      const hit = hits[0];
      if (!hit) continue;
      const normalized = normalizePixabayMusicResult(hit);
      return normalized && filterAllowedMusicTracks([normalized])[0] ? normalized : null;
    } catch {
      // try next endpoint
    }
  }
  return null;
}

/** Build search query from business context (Music Skill). */
export function buildMusicSearchQuery(input: {
  businessVertical?: string | null;
  mood?: string | null;
  objective?: string | null;
  query?: string | null;
}): string {
  const explicit = String(input.query ?? '').trim();
  if (explicit) return explicit;

  const vertical = String(input.businessVertical ?? '').toLowerCase();
  const mood = String(input.mood ?? '').toLowerCase();

  if (vertical.includes('food') || vertical.includes('cafe') || vertical.includes('bakery')) {
    return mood ? `${mood} cafe acoustic` : 'upbeat cafe acoustic';
  }
  if (vertical.includes('beauty') || vertical.includes('salon') || vertical.includes('spa')) {
    return mood ? `${mood} ambient calm` : 'relaxing ambient calm';
  }
  if (vertical.includes('retail') || vertical.includes('fashion')) {
    return mood ? `${mood} fashion` : 'modern upbeat fashion';
  }
  if (vertical.includes('travel')) {
    return mood ? `${mood} travel cinematic` : 'cinematic inspiring travel';
  }
  if (vertical.includes('fitness') || vertical.includes('yoga') || vertical.includes('gym')) {
    return mood ? `${mood} wellness` : 'calm wellness meditation';
  }
  if (mood) return `${mood} background music`;
  if (input.objective) return `${input.objective} background music`;
  return 'upbeat background music';
}
