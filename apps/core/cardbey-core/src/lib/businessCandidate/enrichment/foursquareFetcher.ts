/**
 * Foursquare Places API (free tier) — Tier 3b.
 * Skips silently when FOURSQUARE_API_KEY is unset.
 */

import type { EnrichmentBudget } from './budget.js';

const FSQ_ENDPOINT = 'https://api.foursquare.com/v3/places/search';
const FSQ_PHOTOS_ENDPOINT = 'https://api.foursquare.com/v3/places/{fsq_id}/photos';

export type FoursquareResult = {
  fsqId: string;
  fullName: string | null;
  description: string | null;
  categories: string[];
  website: string | null;
  phone: string | null;
  hours: string | null;
  verified: boolean;
};

export type FoursquarePhoto = {
  url: string;
  width: number;
  height: number;
};

function fsqKey(): string | null {
  return process.env.FOURSQUARE_API_KEY?.trim() || null;
}

export async function fetchFoursquareVenue(
  budget: EnrichmentBudget,
  businessName: string,
  suburb: string | null,
  state: string = 'VIC',
  country: string = 'AU',
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
    near,
    limit: '3',
    fields: 'fsq_id,name,description,categories,website,tel,hours,verified',
  });

  budget.consumeFetch();
  try {
    const response = await fetch(`${FSQ_ENDPOINT}?${params}`, {
      headers: {
        Authorization: key,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      results?: Array<{
        fsq_id?: string;
        name?: string;
        description?: string;
        categories?: Array<{ name?: string }>;
        website?: string;
        tel?: string;
        hours?: { display?: string };
        verified?: boolean;
      }>;
    };
    const results = data?.results ?? [];
    const needle = name.toLowerCase().slice(0, 8);
    const best =
      results.find((r) => r.name?.toLowerCase().includes(needle)) ?? results[0];
    if (!best?.fsq_id) return null;
    return {
      fsqId: best.fsq_id,
      fullName: best.name ?? null,
      description: best.description ?? null,
      categories: (best.categories ?? [])
        .map((c) => c.name)
        .filter((n): n is string => Boolean(n)),
      website: best.website ?? null,
      phone: best.tel ?? null,
      hours: best.hours?.display ?? null,
      verified: best.verified ?? false,
    };
  } catch {
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
    const url = `${FSQ_PHOTOS_ENDPOINT.replace('{fsq_id}', encodeURIComponent(fsqId))}?limit=${maxPhotos}&sort=POPULAR`;
    const response = await fetch(url, {
      headers: { Authorization: key, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return [];
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
