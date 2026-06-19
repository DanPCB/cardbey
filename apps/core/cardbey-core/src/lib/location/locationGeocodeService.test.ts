/**
 * Location geocode service tests — cache, empty query, provider adapter.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  geocodeAddress,
  reverseGeocodeCoordinates,
  setGeocodeProvider,
} from './locationGeocodeService.js';
import { clearGeocodeCache } from './geocodeCache.js';
import type { GeocodeProvider, GeocodeResult, ReverseGeocodeResult } from './geocodeTypes.js';

const mockMelbourne: GeocodeResult = {
  formattedAddress: 'Melbourne VIC, Australia',
  latitude: -37.8136,
  longitude: 144.9631,
  confidence: 'city_level',
  provider: 'mock',
  providerPlaceId: 'relation:424612',
  city: 'Melbourne',
  state: 'Victoria',
  postcode: '3000',
  country: 'Australia',
  suburb: null,
};

const mockProvider: GeocodeProvider = {
  name: 'mock',
  search: vi.fn(async ({ query }) => {
    if (!query.trim()) return [];
    if (/melbourne/i.test(query)) return [mockMelbourne];
    return [];
  }),
  reverse: vi.fn(async ({ latitude, longitude }) => {
    if (latitude === -37.8136 && longitude === 144.9631) {
      return {
        formattedAddress: 'Melbourne VIC, Australia',
        city: 'Melbourne',
        state: 'Victoria',
        postcode: '3000',
        country: 'Australia',
        suburb: null,
        confidence: 'city_level',
        provider: 'mock',
      } satisfies ReverseGeocodeResult;
    }
    return null;
  }),
};

describe('locationGeocodeService', () => {
  beforeEach(() => {
    clearGeocodeCache();
    setGeocodeProvider(mockProvider);
    vi.clearAllMocks();
  });

  it('returns empty array for blank query without calling provider', async () => {
    const results = await geocodeAddress({ query: '   ' });
    expect(results).toEqual([]);
    expect(mockProvider.search).not.toHaveBeenCalled();
  });

  it('geocodes Melbourne without Austin/Singapore fallback', async () => {
    const results = await geocodeAddress({ query: 'Melbourne', countryBias: 'au' });
    expect(results).toHaveLength(1);
    expect(results[0].city).toBe('Melbourne');
    expect(results[0].country).toBe('Australia');
    expect(results[0].formattedAddress).not.toMatch(/Austin|Singapore/i);
  });

  it('caches forward geocode results', async () => {
    await geocodeAddress({ query: 'Melbourne' });
    await geocodeAddress({ query: 'Melbourne' });
    expect(mockProvider.search).toHaveBeenCalledTimes(1);
  });

  it('reverse geocode returns null safely for unknown coords', async () => {
    const result = await reverseGeocodeCoordinates(0, 0);
    expect(result).toBeNull();
  });

  it('reverse geocode caches successful lookups', async () => {
    await reverseGeocodeCoordinates(-37.8136, 144.9631);
    await reverseGeocodeCoordinates(-37.8136, 144.9631);
    expect(mockProvider.reverse).toHaveBeenCalledTimes(1);
  });
});
