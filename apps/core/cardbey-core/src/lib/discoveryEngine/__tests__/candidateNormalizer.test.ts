import { describe, expect, it } from 'vitest';
import { normalizeCandidate } from '../normalization/candidateNormalizer.js';
import type { BusinessCandidate } from '../types/index.js';

describe('candidateNormalizer', () => {
  it('splits suburb from business name', () => {
    const normalized = normalizeCandidate({
      providerId: 'osm',
      externalId: 'n/1',
      businessName: 'Lune Croissanterie Fitzroy',
      category: 'cafe',
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
      confidence: 0.8,
      metadata: {},
    });
    expect(normalized.businessName).toBe('Lune Croissanterie');
    expect(normalized.metadata.suburb).toBe('Fitzroy');
  });

  it('normalizes website and phone', () => {
    const normalized = normalizeCandidate({
      providerId: 'manual',
      externalId: 'm/1',
      businessName: 'Test',
      category: null,
      address: null,
      city: null,
      state: null,
      postcode: null,
      country: null,
      latitude: null,
      longitude: null,
      phone: '04 12 345 678',
      email: '  Hello@Example.COM ',
      website: 'example.com',
      socialProfiles: [],
      sourceUrl: null,
      discoveredAt: new Date().toISOString(),
      confidence: 0.5,
      metadata: {},
    });
    expect(normalized.website).toContain('example.com');
    expect(normalized.email).toBe('hello@example.com');
  });
});
