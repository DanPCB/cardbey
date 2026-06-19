/**
 * Nominatim (OpenStreetMap) geocoding provider.
 * Usage policy: https://operations.osmfoundation.org/policies/nominatim/
 */

import type {
  GeocodeProvider,
  GeocodeResult,
  GeocodeSearchInput,
  GeocodeConfidence,
  ReverseGeocodeInput,
  ReverseGeocodeResult,
} from './geocodeTypes.js';

const DEFAULT_BASE_URL = 'https://nominatim.openstreetmap.org';
const MIN_INTERVAL_MS = 1100;

let lastRequestAt = 0;

function nominatimUserAgent(): string {
  return (
    process.env.NOMINATIM_USER_AGENT?.trim() ||
    process.env.GEOCODE_USER_AGENT?.trim() ||
    'Cardbey/1.0 (store-location; contact@cardbey.com)'
  );
}

function nominatimBaseUrl(): string {
  return (process.env.NOMINATIM_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, '');
}

async function throttleNominatim(): Promise<void> {
  const now = Date.now();
  const wait = MIN_INTERVAL_MS - (now - lastRequestAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

function trim(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function confidenceFromNominatim(item: Record<string, unknown>): GeocodeConfidence {
  const type = String(item.type ?? '').toLowerCase();
  const clazz = String(item.class ?? '').toLowerCase();
  const addresstype = String(item.addresstype ?? '').toLowerCase();

  if (['house', 'building', 'residential', 'commercial'].includes(addresstype)) return 'high';
  if (clazz === 'building' || clazz === 'amenity' || clazz === 'shop') return 'high';
  if (type === 'house' || type === 'building') return 'high';
  if (type === 'suburb' || type === 'neighbourhood' || type === 'quarter') return 'medium';
  if (type === 'city' || type === 'town' || type === 'village' || clazz === 'place') return 'city_level';
  return 'low';
}

function addressPartsFromNominatim(item: Record<string, unknown>): {
  suburb: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
} {
  const addr =
    item.address && typeof item.address === 'object' && !Array.isArray(item.address)
      ? (item.address as Record<string, unknown>)
      : {};

  const suburb =
    trim(addr.suburb) ||
    trim(addr.neighbourhood) ||
    trim(addr.quarter) ||
    trim(addr.city_district) ||
    null;
  const city =
    trim(addr.city) ||
    trim(addr.town) ||
    trim(addr.village) ||
    trim(addr.municipality) ||
    null;
  const state = trim(addr.state) || trim(addr.region) || null;
  const postcode = trim(addr.postcode) || null;
  const country = trim(addr.country) || null;

  return { suburb, city, state, postcode, country };
}

function mapNominatimItem(item: Record<string, unknown>): GeocodeResult | null {
  const lat = Number(item.lat);
  const lng = Number(item.lon ?? item.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const formattedAddress = trim(item.display_name);
  if (!formattedAddress) return null;

  const parts = addressPartsFromNominatim(item);
  const osmType = trim(item.osm_type);
  const osmId = item.osm_id != null ? String(item.osm_id) : null;
  const providerPlaceId = osmType && osmId ? `${osmType}:${osmId}` : trim(item.place_id);

  return {
    formattedAddress,
    latitude: lat,
    longitude: lng,
    confidence: confidenceFromNominatim(item),
    provider: 'nominatim',
    providerPlaceId,
    ...parts,
  };
}

async function nominatimFetch(path: string, params: Record<string, string>): Promise<unknown> {
  await throttleNominatim();
  const url = new URL(`${nominatimBaseUrl()}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      'User-Agent': nominatimUserAgent(),
    },
  });
  if (!res.ok) {
    throw new Error(`Nominatim HTTP ${res.status}`);
  }
  return res.json();
}

export class NominatimGeocodeProvider implements GeocodeProvider {
  readonly name = 'nominatim';

  async search(input: GeocodeSearchInput): Promise<GeocodeResult[]> {
    const query = input.query.trim();
    if (!query) return [];

    const params: Record<string, string> = {
      q: query,
      format: 'json',
      addressdetails: '1',
      limit: String(Math.min(Math.max(input.limit ?? 5, 1), 10)),
    };

    const countryBias = trim(input.countryBias);
    const cityBias = trim(input.cityBias);
    if (countryBias) {
      params.countrycodes = countryBias.length <= 3 ? countryBias.toLowerCase() : '';
    }

    const searchQuery = cityBias && !query.toLowerCase().includes(cityBias.toLowerCase())
      ? `${query}, ${cityBias}`
      : query;
    params.q = searchQuery;

    const raw = await nominatimFetch('/search', params);
    if (!Array.isArray(raw)) return [];

    return raw
      .map((item) => (item && typeof item === 'object' ? mapNominatimItem(item as Record<string, unknown>) : null))
      .filter((r): r is GeocodeResult => r != null);
  }

  async reverse(input: ReverseGeocodeInput): Promise<ReverseGeocodeResult | null> {
    const { latitude, longitude } = input;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

    const raw = await nominatimFetch('/reverse', {
      lat: String(latitude),
      lon: String(longitude),
      format: 'json',
      addressdetails: '1',
    });

    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const item = raw as Record<string, unknown>;
    const mapped = mapNominatimItem(item);
    if (!mapped) return null;

    return {
      formattedAddress: mapped.formattedAddress,
      city: mapped.city,
      state: mapped.state,
      postcode: mapped.postcode,
      country: mapped.country,
      suburb: mapped.suburb,
      confidence: mapped.confidence,
      provider: mapped.provider,
    };
  }
}

export const nominatimGeocodeProvider = new NominatimGeocodeProvider();

/** Test helper — reset throttle clock */
export function resetNominatimThrottleForTests(): void {
  lastRequestAt = 0;
}
