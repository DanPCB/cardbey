import { describe, expect, it } from 'vitest';
import { computeDiscoveryScore } from '../scoring/discoveryScore.js';
import type { BusinessCandidate } from '../types/index.js';

function baseCandidate(overrides: Partial<BusinessCandidate> = {}): BusinessCandidate {
  return {
    providerId: 'manual',
    externalId: 'test-1',
    businessName: 'Test Biz',
    category: null,
    address: null,
    city: null,
    state: null,
    postcode: null,
    country: null,
    latitude: null,
    longitude: null,
    phone: null,
    email: null,
    website: null,
    socialProfiles: [],
    sourceUrl: null,
    discoveredAt: new Date().toISOString(),
    confidence: 0.5,
    metadata: {},
    ...overrides,
  };
}

describe('discoveryScore', () => {
  it('scores minimal candidate low', () => {
    expect(computeDiscoveryScore(baseCandidate())).toBeLessThan(30);
  });

  it('scores rich candidate higher', () => {
    const score = computeDiscoveryScore(
      baseCandidate({
        website: 'https://example.com',
        phone: '+61390000000',
        address: '1 Main St',
        latitude: -37.8,
        longitude: 144.9,
        category: 'food',
        socialProfiles: [{ platform: 'instagram', url: 'https://instagram.com/x' }],
      }),
    );
    expect(score).toBeGreaterThanOrEqual(90);
  });
});
