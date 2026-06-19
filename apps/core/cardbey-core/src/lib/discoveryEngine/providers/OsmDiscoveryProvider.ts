/**
 * OpenStreetMap discovery via Nominatim (area) + Overpass (POI).
 * Creates BusinessCandidate[] only — never stores.
 */

import { randomUUID } from 'node:crypto';
import type { BusinessCandidate, DiscoveryDiscoverParams, DiscoveryProvider } from '../types/index.js';

const DEFAULT_OVERPASS = 'https://overpass-api.de/api/interpreter';
const DEFAULT_NOMINATIM = 'https://nominatim.openstreetmap.org';
/** Nominatim usage policy: max 1 req/s — https://operations.osmfoundation.org/policies/nominatim/ */
const NOMINATIM_MIN_INTERVAL_MS = 1100;
/** Overpass courtesy delay between chained requests */
const OVERPASS_MIN_INTERVAL_MS = 2000;

let lastNominatimAt = 0;
let lastOverpassAt = 0;

async function throttleNominatim(): Promise<void> {
  const now = Date.now();
  const wait = NOMINATIM_MIN_INTERVAL_MS - (now - lastNominatimAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNominatimAt = Date.now();
}

async function throttleOverpass(): Promise<void> {
  const now = Date.now();
  const wait = OVERPASS_MIN_INTERVAL_MS - (now - lastOverpassAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastOverpassAt = Date.now();
}

/** Test hook — reset throttle clocks */
export function resetOsmThrottleForTests(): void {
  lastNominatimAt = 0;
  lastOverpassAt = 0;
}

const CATEGORY_FILTERS: Record<string, string[]> = {
  food: ['amenity=restaurant', 'amenity=cafe', 'amenity=fast_food', 'amenity=bar', 'amenity=pub'],
  retail: ['shop'],
  health: ['amenity=pharmacy', 'amenity=clinic', 'amenity=dentist'],
  beauty: ['shop=beauty', 'shop=hairdresser'],
  hospitality: ['tourism=hotel', 'tourism=guest_house'],
};

export type OsmFetchImpl = typeof fetch;

export interface OsmDiscoveryProviderOptions {
  fetchImpl?: OsmFetchImpl;
  overpassUrl?: string;
  nominatimUrl?: string;
  userAgent?: string;
}

function trim(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s || null;
}

function categoryTags(category?: string): string[] {
  if (!category) {
    return ['amenity', 'shop'];
  }
  const key = category.toLowerCase().replace(/\s+/g, '_');
  return CATEGORY_FILTERS[key] ?? [`amenity=${key}`, `shop=${key}`];
}

function buildOverpassQuery(
  bbox: { south: number; west: number; north: number; east: number },
  tags: string[],
  limit: number,
): string {
  const { south, west, north, east } = bbox;
  const box = `${south},${west},${north},${east}`;
  const parts: string[] = [];
  for (const tag of tags) {
    if (tag.includes('=')) {
      const [k, v] = tag.split('=');
      parts.push(`node["${k}"="${v}"](${box});`);
      parts.push(`way["${k}"="${v}"](${box});`);
    } else {
      parts.push(`node["${tag}"](${box});`);
      parts.push(`way["${tag}"](${box});`);
    }
  }
  return `[out:json][timeout:25];(${parts.join('')});out center ${limit};`;
}

async function geocodeArea(
  query: string,
  fetchImpl: OsmFetchImpl,
  nominatimUrl: string,
  userAgent: string,
): Promise<{ south: number; west: number; north: number; east: number } | null> {
  const url = new URL(`${nominatimUrl}/search`);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('addressdetails', '1');

  await throttleNominatim();
  const res = await fetchImpl(url.toString(), {
    headers: { 'User-Agent': userAgent, Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as Array<{ boundingbox?: string[] }>;
  const item = data[0];
  if (!item?.boundingbox || item.boundingbox.length < 4) return null;
  const [south, north, west, east] = item.boundingbox.map(Number);
  return { south, west, north, east };
}

function mapOverpassElement(el: Record<string, unknown>, discoveredAt: string): BusinessCandidate | null {
  const tags = (el.tags as Record<string, string>) ?? {};
  const name = trim(tags.name);
  if (!name) return null;

  const lat =
    typeof el.lat === 'number'
      ? el.lat
      : typeof (el.center as { lat?: number })?.lat === 'number'
        ? (el.center as { lat: number }).lat
        : null;
  const lon =
    typeof el.lon === 'number'
      ? el.lon
      : typeof (el.center as { lon?: number })?.lon === 'number'
        ? (el.center as { lon: number }).lon
        : null;

  const osmType = trim(el.type) ?? 'node';
  const osmId = el.id != null ? String(el.id) : randomUUID();
  const externalId = `${osmType}/${osmId}`;

  const category =
    trim(tags.amenity) ?? trim(tags.shop) ?? trim(tags.tourism) ?? trim(tags.office) ?? null;

  const addrParts = [
    trim(tags['addr:housenumber']),
    trim(tags['addr:street']),
  ].filter(Boolean);

  return {
    providerId: 'osm',
    externalId,
    businessName: name,
    category,
    address: addrParts.length ? addrParts.join(' ') : trim(tags['addr:full']),
    city: trim(tags['addr:city']) ?? trim(tags['addr:suburb']),
    state: trim(tags['addr:state']),
    postcode: trim(tags['addr:postcode']),
    country: trim(tags['addr:country']),
    latitude: lat,
    longitude: lon,
    phone: trim(tags.phone) ?? trim(tags['contact:phone']),
    email: trim(tags.email) ?? trim(tags['contact:email']),
    website: trim(tags.website) ?? trim(tags['contact:website']),
    socialProfiles: [],
    sourceUrl: `https://www.openstreetmap.org/${osmType}/${osmId}`,
    discoveredAt,
    confidence: lat != null && lon != null ? 0.85 : 0.6,
    metadata: { osmTags: tags },
  };
}

export class OsmDiscoveryProvider implements DiscoveryProvider {
  readonly providerId = 'osm' as const;
  private readonly fetchImpl: OsmFetchImpl;
  private readonly overpassUrl: string;
  private readonly nominatimUrl: string;
  private readonly userAgent: string;

  constructor(options: OsmDiscoveryProviderOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.overpassUrl = options.overpassUrl ?? DEFAULT_OVERPASS;
    this.nominatimUrl = options.nominatimUrl ?? DEFAULT_NOMINATIM;
    this.userAgent =
      options.userAgent ??
      process.env.NOMINATIM_USER_AGENT?.trim() ??
      'CardbeyDiscoveryEngine/1.0 (contact@cardbey.com)';
  }

  async discover(params: DiscoveryDiscoverParams): Promise<BusinessCandidate[]> {
    const limit = Math.min(params.limit ?? 100, 500);
    const discoveredAt = new Date().toISOString();
    let bbox = params.bbox ?? null;

    if (!bbox) {
      const geoQuery = params.postcode
        ? params.postcode
        : params.city
          ? params.city
          : null;
      if (geoQuery) {
        bbox = (await geocodeArea(geoQuery, this.fetchImpl, this.nominatimUrl, this.userAgent)) ?? null;
      }
    }

    if (!bbox) {
      throw new Error('OSM discovery requires city, postcode, or bbox');
    }

    const tags = categoryTags(params.category);
    const query = buildOverpassQuery(bbox, tags, limit);

    await throttleOverpass();
    const res = await this.fetchImpl(this.overpassUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': this.userAgent,
      },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (!res.ok) {
      throw new Error(`Overpass HTTP ${res.status}`);
    }

    const payload = (await res.json()) as { elements?: Record<string, unknown>[] };
    const elements = payload.elements ?? [];
    const candidates: BusinessCandidate[] = [];

    for (const el of elements) {
      const mapped = mapOverpassElement(el, discoveredAt);
      if (mapped) candidates.push(mapped);
      if (candidates.length >= limit) break;
    }

    return candidates;
  }
}

export const osmDiscoveryProvider = new OsmDiscoveryProvider();
