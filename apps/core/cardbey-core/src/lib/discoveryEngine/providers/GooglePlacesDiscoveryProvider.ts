/**
 * Google Places discovery provider — official Places API only (never scrapes).
 * Falls back gracefully when GOOGLE_PLACES_API_KEY is not configured.
 */

import { randomUUID } from 'node:crypto';
import {
  isGooglePlacesConfigured,
  searchGooglePlaces,
} from '../../businessDiscovery/businessDiscoverySources.js';
import type { BusinessCandidate, DiscoveryDiscoverParams, DiscoveryProvider } from '../types/index.js';

function trim(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s || null;
}

function parseSuburbFromAddress(address: string | null, fallbackCity?: string): string | null {
  if (fallbackCity) return fallbackCity;
  if (!address) return null;
  const parts = address.split(',').map((p) => p.trim());
  return parts.length >= 2 ? parts[parts.length - 3] ?? parts[0] : parts[0] ?? null;
}

/** Build Places location bias. Melbourne pilot (no countryCode) keeps VIC Australia. */
export function buildGooglePlacesLocationBias(params: {
  suburb: string;
  countryCode?: string | null;
  regionCode?: string | null;
  locationBias?: string | null;
}): string {
  const explicit = trim(params.locationBias);
  if (explicit) return explicit;
  const suburb = trim(params.suburb) ?? 'Melbourne';
  const country = trim(params.countryCode)?.toUpperCase();
  if (country === 'VN') return `${suburb}, Vietnam`;
  if (country === 'AU') {
    const state = trim(params.regionCode) ?? 'VIC';
    return `${suburb} ${state} Australia`;
  }
  // Legacy Melbourne real-local default
  return `${suburb} VIC Australia`;
}

export class GooglePlacesDiscoveryProvider implements DiscoveryProvider {
  readonly providerId = 'google_places' as const;

  async discover(params: DiscoveryDiscoverParams): Promise<BusinessCandidate[]> {
    if (!isGooglePlacesConfigured()) return [];

    const category = trim(params.category) ?? 'business';
    const suburb = trim(params.city) ?? trim(params.region) ?? 'Melbourne';
    const countryCode = (trim(params.countryCode)?.toUpperCase() as string | null) ?? null;
    const location = buildGooglePlacesLocationBias({
      suburb,
      countryCode,
      regionCode: params.regionCode,
      locationBias: params.locationBias,
    });
    const query = `${category} ${suburb}`;
    const limit = Math.min(Math.max(params.limit ?? 10, 1), 20);

    const results = await searchGooglePlaces(query, location);
    const discoveredAt = new Date().toISOString();
    const stampCountry = countryCode ?? 'AU';
    const stampState =
      trim(params.regionCode) ?? (stampCountry === 'AU' ? 'VIC' : null);

    return results.slice(0, limit).map((row, index) => {
      const raw = row.raw as Record<string, unknown>;
      const placeId = trim(raw.sourceId);
      const lat = typeof raw.lat === 'number' ? raw.lat : null;
      const lng = typeof raw.lng === 'number' ? raw.lng : null;
      const address = trim(raw.address);
      const suburbParsed = parseSuburbFromAddress(address, suburb);

      return {
        providerId: 'google_places',
        externalId: placeId ?? `google-${randomUUID()}`,
        businessName: trim(raw.name),
        category: trim(raw.category) ?? category,
        address,
        city: suburbParsed,
        state: stampState,
        postcode: null,
        country: stampCountry,
        latitude: lat,
        longitude: lng,
        phone: null,
        email: null,
        website: null,
        socialProfiles: [],
        sourceUrl: row.attribution.sourceUrl ?? null,
        discoveredAt,
        confidence: 0.85,
        metadata: {
          placeId,
          suburb: suburbParsed,
          rawSourceJson: raw,
          discoveryQuery: query,
          discoveryLocation: location,
          resultIndex: index,
        },
      };
    });
  }
}

export const googlePlacesDiscoveryProvider = new GooglePlacesDiscoveryProvider();
