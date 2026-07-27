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

export class GooglePlacesDiscoveryProvider implements DiscoveryProvider {
  readonly providerId = 'google_places' as const;

  async discover(params: DiscoveryDiscoverParams): Promise<BusinessCandidate[]> {
    if (!isGooglePlacesConfigured()) return [];

    const category = trim(params.category) ?? 'business';
    const suburb = trim(params.city) ?? trim(params.region) ?? 'Melbourne';
    const location = `${suburb} VIC Australia`;
    const query = `${category} ${suburb}`;
    const limit = Math.min(Math.max(params.limit ?? 10, 1), 20);

    const results = await searchGooglePlaces(query, location);
    const discoveredAt = new Date().toISOString();

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
        state: 'VIC',
        postcode: null,
        country: 'AU',
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
