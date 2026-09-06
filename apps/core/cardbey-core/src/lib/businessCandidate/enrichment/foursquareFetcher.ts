/**
 * Foursquare Places API (free tier) — Tier 3b.
 * Skips silently when FOURSQUARE_API_KEY is unset.
 * Venue attach requires strong name match — never results[0].
 */

import type { EnrichmentBudget } from './budget.js';
import {
  pickBestNamedVenue,
  VENUE_NAME_MATCH_MIN,
} from './venueNameMatch.js';

const FSQ_BASE = 'https://places-api.foursquare.com';
const FSQ_SEARCH_ENDPOINT = `${FSQ_BASE}/places/search`;
const FSQ_PHOTOS_ENDPOINT = `${FSQ_BASE}/places/{fsq_place_id}/photos`;
const FSQ_API_VERSION =
  process.env.FOURSQUARE_API_VERSION?.trim() || '2025-06-17';
const FSQ_SEARCH_FIELDS =
  'fsq_place_id,name,description,categories,website,tel,hours,verified';

export type FoursquareResult = {
  fsqId: string;
  fullName: string | null;
  description: string | null;
  categories: string[];
  website: string | null;
  phone: string | null;
  hours: string | null;
  verified: boolean;
  /** Name-match confidence against the query business (≥ VENUE_NAME_MATCH_MIN). */
  nameMatchConfidence: number;
  matched: true;
};

export type FoursquarePhoto = {
  url: string;
  width: number;
  height: number;
};

function fsqKey(): string | null {
  return process.env.FOURSQUARE_API_KEY?.trim() || null;
}

function fsqAuthHeaders(key: string): Record<string, string> {
  const token = key.replace(/^Bearer\s+/i, '');
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'X-Places-Api-Version': FSQ_API_VERSION,
  };
}

type FsqPlaceRow = {
  fsq_place_id?: string;
  fsq_id?: string;
  name?: string;
  description?: string;
  categories?: Array<{ name?: string }>;
  website?: string;
  tel?: string;
  hours?: { display?: string };
  verified?: boolean;
};

function pickFsqPlaceId(place: FsqPlaceRow): string | null {
  return place.fsq_place_id ?? place.fsq_id ?? null;
}

export async function fetchFoursquareVenue(
  budget: EnrichmentBudget,
  businessName: string,
  suburb: string | null,
  state: string | null = null,
  country: string | null = null,
): Promise<FoursquareResult | null> {
  const key = fsqKey();
  if (!key) {
    console.warn('[Foursquare] FOURSQUARE_API_KEY not set — skipping');
    return null;
  }
  const name = businessName.trim();
  if (!name) return null;

  const near = [suburb, state, country].filter(Boolean).join(', ');
  const params = new URLSearchParams({
    query: name,
    limit: '5',
    fields: FSQ_SEARCH_FIELDS,
  });
  if (near) params.set('near', near);

  budget.consumeFetch();
  try {
    const response = await fetch(`${FSQ_SEARCH_ENDPOINT}?${params}`, {
      headers: fsqAuthHeaders(key),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      const body = (await response.text()).slice(0, 160);
      console.warn(
        `[Foursquare] search HTTP ${response.status} for "${name}": ${body}`,
      );
      return null;
    }
    const data = (await response.json()) as { results?: FsqPlaceRow[] };
    const results = data?.results ?? [];
    const picked = pickBestNamedVenue(
      name,
      results,
      (r) => r.name ?? null,
      VENUE_NAME_MATCH_MIN,
    );
    if (!picked) {
      console.warn(
        `[Foursquare] no strong name match for "${name}" among ${results.length} results — refusing results[0]`,
      );
      return null;
    }
    const best = picked.row;
    const fsqId = pickFsqPlaceId(best);
    if (!fsqId) return null;
    return {
      fsqId,
      fullName: best.name ?? null,
      description: best.description ?? null,
      categories: (best.categories ?? [])
        .map((c) => c.name)
        .filter((n): n is string => Boolean(n)),
      website: best.website ?? null,
      phone: best.tel ?? null,
      hours: best.hours?.display ?? null,
      verified: best.verified ?? false,
      nameMatchConfidence: picked.confidence,
      matched: true,
    };
  } catch (err) {
    console.warn(
      `[Foursquare] search failed for "${name}":`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

export async function fetchFoursquarePhotos(
  budget: EnrichmentBudget,
  fsqId: string,
  maxPhotos: number = 3,
): Promise<FoursquarePhoto[]> {
  const key = fsqKey();
  if (!key || !fsqId) return [];

  budget.consumeFetch();
  try {
    const url = `${FSQ_PHOTOS_ENDPOINT.replace('{fsq_place_id}', encodeURIComponent(fsqId))}?limit=${maxPhotos}&sort=POPULAR`;
    const response = await fetch(url, {
      headers: fsqAuthHeaders(key),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      const body = (await response.text()).slice(0, 160);
      console.warn(
        `[Foursquare] photos HTTP ${response.status} for ${fsqId}: ${body}`,
      );
      return [];
    }
    const photos = (await response.json()) as Array<{
      prefix?: string;
      suffix?: string;
      width?: number;
      height?: number;
    }>;
    if (!Array.isArray(photos)) return [];
    return photos
      .filter((p) => (p.width ?? 0) >= 800 && p.prefix && p.suffix)
      .map((p) => ({
        url: `${p.prefix}original${p.suffix}`,
        width: p.width ?? 0,
        height: p.height ?? 0,
      }));
  } catch {
    return [];
  }
}
