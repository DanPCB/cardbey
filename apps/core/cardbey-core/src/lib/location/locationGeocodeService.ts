/**
 * Location geocode service — cached, provider-adapter based forward/reverse geocoding.
 */

import type { GeocodeProvider, GeocodeResult, ReverseGeocodeResult } from './geocodeTypes.js';
import {
  getForwardGeocodeCache,
  setForwardGeocodeCache,
  getReverseGeocodeCache,
  setReverseGeocodeCache,
} from './geocodeCache.js';
import { nominatimGeocodeProvider } from './nominatimGeocodeProvider.js';

let activeProvider: GeocodeProvider = nominatimGeocodeProvider;

/** Swap provider in tests or when migrating off Nominatim. */
export function setGeocodeProvider(provider: GeocodeProvider): void {
  activeProvider = provider;
}

export function getGeocodeProvider(): GeocodeProvider {
  return activeProvider;
}

export type GeocodeServiceInput = {
  query: string;
  countryBias?: string | null;
  cityBias?: string | null;
};

export async function geocodeAddress(input: GeocodeServiceInput): Promise<GeocodeResult[]> {
  const query = String(input.query ?? '').trim();
  if (!query) return [];

  const cached = getForwardGeocodeCache<GeocodeResult[]>(
    query,
    input.countryBias,
    input.cityBias,
  );
  if (cached) return cached;

  const results = await activeProvider.search({
    query,
    countryBias: input.countryBias,
    cityBias: input.cityBias,
    limit: 5,
  });

  setForwardGeocodeCache(query, input.countryBias, input.cityBias, results);
  return results;
}

export async function reverseGeocodeCoordinates(
  latitude: number,
  longitude: number,
): Promise<ReverseGeocodeResult | null> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const cached = getReverseGeocodeCache<ReverseGeocodeResult>(latitude, longitude);
  if (cached) return cached;

  const result = await activeProvider.reverse({ latitude, longitude });
  if (result) {
    setReverseGeocodeCache(latitude, longitude, result);
  }
  return result;
}
