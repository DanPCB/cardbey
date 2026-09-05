// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildGooglePlacesLocationBias } from '../../discoveryEngine/providers/GooglePlacesDiscoveryProvider.js';
import { registryBboxToOverpass } from '../../discoveryEngine/providers/OsmDiscoveryProvider.js';
import { getCategoryById, getTerritoryById } from '../../marketRegistry/index.js';
import { prepareMultiMarketDiscoveryJob } from '../multiMarketDiscoveryService.js';

describe('multi-market provider geo', () => {
  it('keeps Melbourne VIC bias when countryCode is unset', () => {
    expect(buildGooglePlacesLocationBias({ suburb: 'Braybrook' })).toBe(
      'Braybrook VIC Australia',
    );
  });

  it('biases Google Places to Vietnam when countryCode=VN', () => {
    expect(
      buildGooglePlacesLocationBias({
        suburb: 'District 1',
        countryCode: 'VN',
      }),
    ).toBe('District 1, Vietnam');
  });

  it('biases Google Places to AU state when countryCode=AU', () => {
    expect(
      buildGooglePlacesLocationBias({
        suburb: 'Melbourne',
        countryCode: 'AU',
        regionCode: 'VIC',
      }),
    ).toBe('Melbourne VIC Australia');
  });

  it('converts registry bbox [minLng,minLat,maxLng,maxLat] to Overpass south/west/north/east', () => {
    expect(registryBboxToOverpass([106.3, 10.3, 107.1, 11.2])).toEqual({
      south: 10.3,
      west: 106.3,
      north: 11.2,
      east: 107.1,
    });
  });

  it('hotel category exposes tourism=hotel OSM tags', () => {
    const hotel = getCategoryById('hotel');
    expect(hotel?.osmTags).toContain('tourism=hotel');
  });

  it('VN District 1 job resolves parent HCMC bbox and English locality', () => {
    const job = prepareMultiMarketDiscoveryJob({
      countryCode: 'VN',
      territoryId: 'vn-hcm-quan-1',
      categoryId: 'hotel',
      dryRun: true,
      requestedLimit: 10,
    });
    expect(job.locality).toBe('District 1');
    expect(job.queryArea?.bbox).toEqual(getTerritoryById('vn-hcm')?.bbox);
    expect(job.searchTerms[0]).toMatch(/khách sạn|hotel/i);
  });
});
