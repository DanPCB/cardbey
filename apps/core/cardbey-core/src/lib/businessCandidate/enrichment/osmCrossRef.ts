/**
 * OpenStreetMap Overpass cross-reference (Tier 2c).
 */

import type { EnrichmentBudget } from './budget.js';

export type OsmMatch = {
  amenity: string | null;
  shop: string | null;
  cuisine: string | null;
  openingHours: string | null;
  website: string | null;
  phone: string | null;
  sourceUrl: string;
  rawExtract: string;
};

export async function queryOsmOverpass(
  budget: EnrichmentBudget,
  businessName: string,
  suburb: string | null,
): Promise<OsmMatch | null> {
  const name = businessName.trim();
  if (!name) return null;

  const suburbClause = suburb?.trim()
    ? `["addr:suburb"~"${suburb.replace(/"/g, '')}",i]`
    : '';
  const query = `[out:json][timeout:15];
node["name"~"${name.replace(/"/g, '')}",i]${suburbClause};
out body 5;`;

  const sourceUrl = 'https://overpass-api.de/api/interpreter';
  budget.consumeFetch();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(sourceUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      elements?: Array<{ tags?: Record<string, string> }>;
    };
    const el = json.elements?.[0];
    const tags = el?.tags;
    if (!tags) return null;
    return {
      amenity: tags.amenity ?? null,
      shop: tags.shop ?? null,
      cuisine: tags.cuisine ?? null,
      openingHours: tags.opening_hours ?? null,
      website: tags.website ?? null,
      phone: tags.phone ?? tags['contact:phone'] ?? null,
      sourceUrl,
      rawExtract: JSON.stringify(tags).slice(0, 800),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
