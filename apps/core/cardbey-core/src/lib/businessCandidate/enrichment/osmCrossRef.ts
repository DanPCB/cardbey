/**
 * OpenStreetMap Overpass cross-reference (Tier 2b/2c).
 * Rate-limited to 1 request/second. Optional OSM_OVERPASS_URL override.
 */

import type { EnrichmentBudget } from './budget.js';

export type OsmMatch = {
  fullName: string | null;
  amenity: string | null;
  shop: string | null;
  cuisine: string | null;
  openingHours: string | null;
  website: string | null;
  phone: string | null;
  osmId: string | null;
  sourceUrl: string;
  rawExtract: string;
};

let lastOverpassAtMs = 0;

async function respectOverpassRateLimit(): Promise<void> {
  const elapsed = Date.now() - lastOverpassAtMs;
  if (elapsed < 1000) {
    await new Promise((r) => setTimeout(r, 1000 - elapsed));
  }
  lastOverpassAtMs = Date.now();
}

function escapeOverpassLiteral(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '');
}

export function osmTagsToCategorySignals(match: OsmMatch): string[] {
  return [match.amenity, match.shop, match.cuisine].filter(
    (s): s is string => Boolean(s && s.trim()),
  );
}

export async function queryOsmOverpass(
  budget: EnrichmentBudget,
  businessName: string,
  suburb: string | null,
  _state: string | null = 'VIC',
): Promise<OsmMatch | null> {
  const name = businessName.trim();
  if (!name) return null;

  const escapedName = escapeOverpassLiteral(name);
  const suburbClean = suburb?.trim() ? escapeOverpassLiteral(suburb.trim()) : '';

  // Prefer suburb-scoped match, then fall back to name-only (capped).
  const query = suburbClean
    ? `[out:json][timeout:10];
(
  node["name"~"${escapedName}",i]["addr:suburb"~"${suburbClean}",i];
  way["name"~"${escapedName}",i]["addr:suburb"~"${suburbClean}",i];
  node["name"~"${escapedName}",i];
  way["name"~"${escapedName}",i];
);
out body 5;`
    : `[out:json][timeout:10];
(
  node["name"~"${escapedName}",i];
  way["name"~"${escapedName}",i];
);
out body 5;`;

  const sourceUrl =
    process.env.OSM_OVERPASS_URL?.trim() || 'https://overpass-api.de/api/interpreter';

  budget.consumeFetch();
  await respectOverpassRateLimit();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(sourceUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      elements?: Array<{ id?: number | string; tags?: Record<string, string> }>;
    };
    const elements = json.elements ?? [];
    const best =
      elements.find((e) => e.tags?.name?.toLowerCase() === name.toLowerCase()) ?? elements[0];
    const tags = best?.tags;
    if (!tags) return null;
    return {
      fullName: tags.name ?? null,
      amenity: tags.amenity ?? null,
      shop: tags.shop ?? null,
      cuisine: tags.cuisine ?? null,
      openingHours: tags.opening_hours ?? null,
      website: tags.website ?? tags['contact:website'] ?? null,
      phone: tags.phone ?? tags['contact:phone'] ?? null,
      osmId: best?.id != null ? String(best.id) : null,
      sourceUrl,
      rawExtract: JSON.stringify(tags).slice(0, 800),
    };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.warn(`[OSM] Timeout fetching ${name}`);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** @internal */
export const __test = { escapeOverpassLiteral };
