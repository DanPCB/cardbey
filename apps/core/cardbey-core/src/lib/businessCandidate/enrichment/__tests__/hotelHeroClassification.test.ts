// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  buildHeroSearchQueries,
  inferHeroSubCategory,
} from '../heroSearchQueries.js';
import { resolvePilotCategoryKey } from '../../media/categoryMediaVocabulary.js';
import { extractProviderPhotoRef } from '../../media/mediaDiscoveryAgent.js';

describe('hotel hero classification', () => {
  it('classifies hotel names as hotel not pub', () => {
    expect(inferHeroSubCategory({ businessName: 'Pharaon Hotel 1', placesTypes: ['lodging'] })).toBe(
      'hotel',
    );
    expect(inferHeroSubCategory({ businessName: 'Edoya Hotel Ben', businessType: 'Hotel' })).toBe(
      'hotel',
    );
    expect(inferHeroSubCategory({ businessName: 'Local Pub', placesTypes: ['bar'] })).toBe('pub');
  });

  it('builds name-first hotel queries instead of shared pub bar stock', () => {
    const queries = buildHeroSearchQueries({
      businessName: 'Pharaon Hotel 1',
      suburb: 'District 1',
      category: 'Hotel',
      placesTypes: ['lodging', 'hotel'],
    });
    expect(queries[0]).toMatch(/Pharaon Hotel 1/i);
    expect(queries.some((q) => /pub bar interior/i.test(q))).toBe(false);
  });

  it('maps hotel business type to hotel category stock key', () => {
    expect(resolvePilotCategoryKey('Hotel', 'Pharaon Hotel 1')).toBe('hotel');
  });

  it('does not treat Maps place URL-only raw as a photo ref', () => {
    expect(
      extractProviderPhotoRef({
        googleMapsUri: 'https://maps.google.com/?cid=123',
      }),
    ).toBeNull();
    expect(
      extractProviderPhotoRef({
        photos: [{ name: 'places/abc/photos/xyz' }],
      }),
    ).toEqual({ photoName: 'places/abc/photos/xyz', photoReference: undefined });
  });
});
