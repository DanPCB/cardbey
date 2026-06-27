/**
 * Openverse audio search — fallback when Pixabay music API is unavailable.
 * API: GET https://api.openverse.org/v1/audio/
 */

import {
  attachMusicAttestation,
  filterAllowedMusicTracks,
  type NormalizedMusicTrack,
} from './musicLicensePolicy.js';

export type OpenverseMusicSearchOptions = {
  perPage?: number;
  page?: number;
};

const OPENVERSE_AUDIO_URL = 'https://api.openverse.org/v1/audio/';

function formatLicense(hit: Record<string, unknown>): string {
  const license = typeof hit.license === 'string' ? hit.license.trim().toUpperCase() : '';
  const version = typeof hit.license_version === 'string' ? hit.license_version.trim() : '';
  if (license && version) return `CC ${license} ${version}`;
  if (license) return `CC ${license}`;
  return 'Creative Commons';
}

function readTags(hit: Record<string, unknown>): string[] {
  const tags = hit.tags;
  if (!Array.isArray(tags)) return [];
  return tags
    .map((tag) => {
      if (typeof tag === 'string') return tag.trim();
      if (tag && typeof tag === 'object' && typeof (tag as { name?: string }).name === 'string') {
        return (tag as { name: string }).name.trim();
      }
      return '';
    })
    .filter(Boolean);
}

export function normalizeOpenverseMusicResult(hit: Record<string, unknown>): NormalizedMusicTrack | null {
  const id = String(hit.id ?? '').trim();
  const downloadUrl = typeof hit.url === 'string' ? hit.url.trim() : '';
  if (!id || !downloadUrl) return null;

  const title =
    (typeof hit.title === 'string' && hit.title.trim()) ||
    `Openverse track ${id.slice(0, 8)}`;
  const sourceUrl =
    (typeof hit.foreign_landing_url === 'string' && hit.foreign_landing_url.trim()) ||
    (typeof hit.detail_url === 'string' && hit.detail_url.trim()) ||
    downloadUrl;
  const attribution =
    (typeof hit.attribution === 'string' && hit.attribution.trim()) ||
    `"${title}" via Openverse`;
  const durationMs = Number(hit.duration);
  const upstreamProvider =
    typeof hit.provider === 'string' ? hit.provider.trim() : typeof hit.source === 'string' ? hit.source.trim() : null;

  const track: NormalizedMusicTrack = {
    provider: 'openverse',
    providerTrackId: id,
    title,
    duration: Number.isFinite(durationMs) && durationMs > 0 ? Math.round(durationMs / 1000) : null,
    genre: typeof hit.category === 'string' ? hit.category : null,
    mood: null,
    tags: readTags(hit),
    previewUrl: downloadUrl,
    downloadUrl,
    attribution,
    license: formatLicense(hit),
    sourceUrl,
    thumbnailUrl: typeof hit.thumbnail === 'string' ? hit.thumbnail : null,
    metadata: {
      openverse: {
        provider: upstreamProvider,
        source: hit.source ?? null,
        creator: hit.creator ?? null,
        licenseUrl: hit.license_url ?? null,
      },
    },
  };

  return attachMusicAttestation(track);
}

async function fetchOpenverseAudio(
  params: URLSearchParams,
): Promise<{ hits: Record<string, unknown>[]; total: number }> {
  const res = await fetch(`${OPENVERSE_AUDIO_URL}?${params.toString()}`, { method: 'GET' });
  if (!res.ok) {
    throw new Error(`Openverse audio API error ${res.status}`);
  }
  const data = (await res.json()) as {
    results?: unknown[];
    result_count?: number;
  };
  const hits = Array.isArray(data?.results)
    ? data.results.filter((h): h is Record<string, unknown> => Boolean(h) && typeof h === 'object')
    : [];
  return { hits, total: Number(data?.result_count ?? hits.length) };
}

export async function searchOpenverseMusic(
  query: string,
  options: OpenverseMusicSearchOptions = {},
): Promise<{ tracks: NormalizedMusicTrack[]; total: number }> {
  const perPage = Math.min(20, Math.max(3, Number(options.perPage) || 12));
  const page = Math.max(1, Number(options.page) || 1);
  const params = new URLSearchParams({
    q: String(query || 'background music').slice(0, 100),
    page_size: String(perPage),
    page: String(page),
  });

  const { hits, total } = await fetchOpenverseAudio(params);
  const tracks = filterAllowedMusicTracks(
    hits.map(normalizeOpenverseMusicResult).filter((t): t is NormalizedMusicTrack => t != null),
  );
  return { tracks, total };
}

export async function getOpenverseTrackById(trackId: string): Promise<NormalizedMusicTrack | null> {
  const id = String(trackId ?? '').trim();
  if (!id) return null;

  const res = await fetch(`${OPENVERSE_AUDIO_URL}${encodeURIComponent(id)}/`, { method: 'GET' });
  if (!res.ok) return null;
  const hit = (await res.json()) as Record<string, unknown>;
  const normalized = normalizeOpenverseMusicResult(hit);
  if (!normalized) return null;
  return filterAllowedMusicTracks([normalized])[0] ?? null;
}
