/**
 * Market registry + normalisation + flag defaults tests.
 */

import { describe, expect, it } from 'vitest';
import {
  getMarketRegistrySnapshot,
  normalizeMatchKey,
  stripDiacritics,
  validateTerritoryCategoryPair,
} from '../index.js';
import {
  normalizeAddressForCountry,
  normalizeBusinessNameForMatch,
  normalizePhoneForCountry,
} from '../../multiMarketDiscovery/normalizeContact.js';
import { prepareMultiMarketDiscoveryJob } from '../../multiMarketDiscovery/multiMarketDiscoveryService.js';
import { Features } from '../../../config/features.js';

describe('marketRegistry', () => {
  it('reports configured AU/VN coverage without claiming nationwide completeness', () => {
    const snap = getMarketRegistrySnapshot();
    expect(snap.markets.every((m) => m.nationwideComplete === false)).toBe(true);
    expect(snap.territories.some((t) => t.id === 'au-vic-melbourne')).toBe(true);
    expect(snap.territories.some((t) => t.id === 'vn-hcm')).toBe(true);
    expect(snap.territories.some((t) => t.id === 'au-nsw')).toBe(true);
    expect(snap.territories.some((t) => t.id === 'vn-prov-lam-dong')).toBe(true);
    expect(snap.version).toContain('phase1a');
  });

  it('includes fine-grained SME categories for AU and VN', () => {
    const snap = getMarketRegistrySnapshot();
    const auCats = snap.categories.filter((c) => c.countryAvailability.includes('AU'));
    const vnCats = snap.categories.filter((c) => c.countryAvailability.includes('VN'));
    expect(auCats.length).toBeGreaterThanOrEqual(25);
    expect(vnCats.length).toBeGreaterThanOrEqual(20);
    expect(snap.categories.some((c) => c.id === 'bakery')).toBe(true);
    expect(snap.categories.some((c) => c.id === 'banh_mi')).toBe(true);
  });

  it('validates AU territory/category pairs', () => {
    expect(
      validateTerritoryCategoryPair({
        countryCode: 'AU',
        territoryId: 'au-nsw-sydney',
        categoryId: 'food_hospitality',
      }),
    ).toEqual({ ok: true });
  });

  it('validates VN territory/category pairs', () => {
    expect(
      validateTerritoryCategoryPair({
        countryCode: 'VN',
        territoryId: 'vn-hcm',
        categoryId: 'coffee_beverages',
      }),
    ).toEqual({ ok: true });
  });

  it('rejects cross-country territory', () => {
    expect(
      validateTerritoryCategoryPair({
        countryCode: 'AU',
        territoryId: 'vn-hcm',
        categoryId: 'food_hospitality',
      }),
    ).toEqual({ ok: false, error: 'cross_country_territory' });
  });

  it('matches Vietnamese Unicode with diacritic-aware keys', () => {
    expect(stripDiacritics('Hồ Chí Minh')).toBe('Ho Chi Minh');
    expect(normalizeMatchKey('Thành phố Hồ Chí Minh')).toBe('thanh pho ho chi minh');
  });
});

describe('normalizeContact', () => {
  it('normalises Australian phones', () => {
    expect(normalizePhoneForCountry('0412 345 678', 'AU')).toBe('61412345678');
    expect(normalizePhoneForCountry('+61 3 9123 4567', 'AU')).toMatch(/^61/);
  });

  it('normalises Vietnamese phones', () => {
    expect(normalizePhoneForCountry('0901234567', 'VN')).toBe('84901234567');
    expect(normalizePhoneForCountry('+84 28 3822 1234', 'VN')).toMatch(/^84/);
  });

  it('preserves Vietnamese original address text while building match keys', () => {
    const parts = normalizeAddressForCountry({
      countryCode: 'VN',
      address: '12 Nguyễn Huệ',
      locality: 'Quận 1',
      region: 'TP.HCM',
    });
    expect(parts.line1).toBe('12 Nguyễn Huệ');
    expect(parts.matchKey).toContain('nguyen hue');
    expect(parts.matchKey).not.toContain('Nguyễn');
  });

  it('does not force VN into AU address structure', () => {
    const au = normalizeAddressForCountry({
      countryCode: 'AU',
      address: '1 George St',
      locality: 'Sydney',
      region: 'nsw',
      postcode: '2000',
    });
    expect(au.region).toBe('NSW');
    expect(au.postcode).toBe('2000');
    const vn = normalizeAddressForCountry({
      countryCode: 'VN',
      address: '12 Nguyễn Huệ',
      locality: 'Quận 1',
      region: 'Hồ Chí Minh',
      postcode: null,
    });
    expect(vn.region).toBe('Hồ Chí Minh');
  });

  it('name match strips VN diacritics without replacing display name', () => {
    expect(normalizeBusinessNameForMatch('Cà Phê Ông Bầu', 'VN')).toBe('ca phe ong bau');
  });
});

describe('multiMarketDiscoveryJob', () => {
  it('builds bounded territory/category jobs with deterministic batch id prefix', () => {
    const job = prepareMultiMarketDiscoveryJob({
      countryCode: 'AU',
      territoryId: 'au-nsw-sydney',
      categoryId: 'food_hospitality',
      dryRun: true,
      requestedLimit: 20,
    });
    expect(job.estimatedQueryCount).toBe(1);
    expect(job.batchId.startsWith('MM_AU_au-nsw-sydney_food_hospitality_')).toBe(true);
    expect(job.dryRun).toBe(true);
    expect(job.status).toBe('prepared');
  });

  it('rejects invalid cross-country prepare', () => {
    expect(() =>
      prepareMultiMarketDiscoveryJob({
        countryCode: 'VN',
        territoryId: 'au-nsw-sydney',
        categoryId: 'coffee_beverages',
      }),
    ).toThrow(/cross_country_territory/);
  });
});

describe('multiMarketPrebuilt flags', () => {
  it('defaults all new flags OFF', () => {
    expect(Features.multiMarketPrebuilt.discoveryV1).toBe(false);
    expect(Features.multiMarketPrebuilt.australiaDiscoveryV1).toBe(false);
    expect(Features.multiMarketPrebuilt.vietnamDiscoveryV1).toBe(false);
    expect(Features.multiMarketPrebuilt.prebuiltStoreDraftsV1).toBe(false);
    expect(Features.multiMarketPrebuilt.prebuiltStoreAiSuggestionsV1).toBe(false);
    expect(Features.multiMarketPrebuilt.businessClaimV1).toBe(false);
    expect(Features.multiMarketPrebuilt.publicUnclaimedBusinessCardsV1).toBe(false);
    expect(Features.multiMarketPrebuilt.publicUnclaimedCardIndexingV1).toBe(false);
  });
});
