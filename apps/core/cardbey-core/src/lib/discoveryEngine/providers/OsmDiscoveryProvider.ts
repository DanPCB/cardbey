/**
 * OpenStreetMap discovery via Nominatim (area) + Overpass (POI).
 * Creates BusinessCandidate[] only — never stores.
 */

import { randomUUID } from 'node:crypto';
import type { BusinessCandidate, DiscoveryDiscoverParams, DiscoveryProvider } from '../types/index.js';
import { getDiscoveryProviderConfig } from '../config/discoveryProviderConfig.js';
import {
  DiscoveryProviderRateLimitError,
  toDiscoveryProviderError,
} from './discoveryProviderErrors.js';
import { logDiscoveryProviderEvent } from './discoveryProviderLogger.js';

const DEFAULT_OVERPASS = 'https://overpass-api.de/api/interpreter';
const DEFAULT_NOMINATIM = 'https://nominatim.openstreetmap.org';
/** Nominatim usage policy: max 1 req/s */
const NOMINATIM_MIN_INTERVAL_MS = 1100;

let lastNominatimAt = 0;
let lastOverpassAt = 0;
let overpassRequestDelayOverride: number | null = null;

async function throttleNominatim(): Promise<void> {
  const now = Date.now();
  const wait = NOMINATIM_MIN_INTERVAL_MS - (now - lastNominatimAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNominatimAt = Date.now();
}

function resolveOverpassDelay(slowMode = false): number {
  const cfg = getDiscoveryProviderConfig();
  const base = overpassRequestDelayOverride ?? cfg.overpassRequestDelayMs;
  return slowMode ? base * cfg.overpassSlowModeMultiplier : base;
}

async function throttleOverpass(slowMode = false): Promise<void> {
  const delay = resolveOverpassDelay(slowMode);
  const now = Date.now();
  const wait = delay - (now - lastOverpassAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastOverpassAt = Date.now();
}

/** Test hook — reset throttle clocks */
export function resetOsmThrottleForTests(): void {
  lastNominatimAt = 0;
  lastOverpassAt = 0;
  overpassRequestDelayOverride = null;
}

export function setOverpassRequestDelayForTests(ms: number | null): void {
  overpassRequestDelayOverride = ms;
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

export type OsmDiscoverGroupedParams = {
  city: string;
  tags: string[];
  limit: number;
  slowMode?: boolean;
  suburb?: string;
  categories?: string[];
};

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

export function buildOverpassQuery(
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

function parseRetryAfterSeconds(res: Response): number {
  const header = res.headers.get('retry-after');
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(1, Math.ceil(seconds));
  }
  return 30;
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

  async fetchOverpassWithRetry(
    query: string,
    context: { suburb?: string; category?: string; categories?: string[]; slowMode?: boolean },
  ): Promise<{ elements: Record<string, unknown>[]; retryCount: number }> {
    const cfg = getDiscoveryProviderConfig();
    const backoffs = [cfg.overpassBackoffMs, 5000];
    let retryCount = 0;

    for (let attempt = 0; attempt <= cfg.overpassMaxRetries; attempt++) {
      await throttleOverpass(context.slowMode === true);

      const res = await this.fetchImpl(this.overpassUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': this.userAgent,
        },
        body: `data=${encodeURIComponent(query)}`,
      });

      if (res.status === 429) {
        const retryAfterSeconds = parseRetryAfterSeconds(res);
        logDiscoveryProviderEvent('discovery_provider_rate_limited', {
          provider: 'osm_overpass',
          suburb: context.suburb ?? null,
          category: context.category ?? null,
          categories: context.categories ?? null,
          attempt,
          retryAfterSeconds,
        });

        if (attempt < cfg.overpassMaxRetries) {
          const waitMs = backoffs[attempt] ?? cfg.overpassBackoffMs;
          retryCount += 1;
          logDiscoveryProviderEvent('discovery_provider_retry', {
            provider: 'osm_overpass',
            suburb: context.suburb ?? null,
            attempt: attempt + 1,
            waitMs,
          });
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }

        throw new DiscoveryProviderRateLimitError({
          provider: 'osm_overpass',
          retryAfterSeconds,
          suburb: context.suburb,
          category: context.category,
          categories: context.categories,
          message: `Overpass HTTP 429 — public map provider rate limited${context.suburb ? ` (${context.suburb})` : ''}`,
        });
      }

      if (!res.ok) {
        throw new Error(`Overpass HTTP ${res.status}`);
      }

      const payload = (await res.json()) as { elements?: Record<string, unknown>[] };
      return { elements: payload.elements ?? [], retryCount };
    }

    throw new Error('Overpass request failed after retries');
  }

  async discoverGrouped(params: OsmDiscoverGroupedParams): Promise<{
    candidates: BusinessCandidate[];
    retryCount: number;
  }> {
    const limit = Math.min(params.limit ?? 100, 500);
    const discoveredAt = new Date().toISOString();
    const bbox =
      (await geocodeArea(params.city, this.fetchImpl, this.nominatimUrl, this.userAgent)) ?? null;

    if (!bbox) {
      throw new Error('OSM discovery requires city, postcode, or bbox');
    }

    const query = buildOverpassQuery(bbox, params.tags, limit);
    const { elements, retryCount } = await this.fetchOverpassWithRetry(query, {
      suburb: params.suburb ?? params.city,
      categories: params.categories,
      slowMode: params.slowMode,
    });

    const candidates: BusinessCandidate[] = [];
    for (const el of elements) {
      const mapped = mapOverpassElement(el, discoveredAt);
      if (mapped) candidates.push(mapped);
      if (candidates.length >= limit) break;
    }

    return { candidates, retryCount };
  }

  async discover(params: DiscoveryDiscoverParams): Promise<BusinessCandidate[]> {
    const limit = Math.min(params.limit ?? 100, 500);
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

    try {
      const { elements } = await this.fetchOverpassWithRetry(query, {
        suburb: params.city,
        category: params.category,
      });
      const discoveredAt = new Date().toISOString();
      const candidates: BusinessCandidate[] = [];

      for (const el of elements) {
        const mapped = mapOverpassElement(el, discoveredAt);
        if (mapped) candidates.push(mapped);
        if (candidates.length >= limit) break;
      }

      return candidates;
    } catch (err) {
      if (err instanceof DiscoveryProviderRateLimitError) throw err;
      throw toDiscoveryProviderError(err, {
        provider: 'osm_overpass',
        suburb: params.city,
        category: params.category,
      });
    }
  }
}

export const osmDiscoveryProvider = new OsmDiscoveryProvider();
