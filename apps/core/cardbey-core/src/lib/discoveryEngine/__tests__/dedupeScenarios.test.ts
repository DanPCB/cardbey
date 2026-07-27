import { describe, expect, it } from 'vitest';
import {
  computeIdentityScore,
  identityDecisionFromScore,
} from '../dedupe/BusinessIdentityEngine.js';

const base = {
  businessName: null as string | null,
  phone: null as string | null,
  email: null as string | null,
  website: null as string | null,
  latitude: null as number | null,
  longitude: null as number | null,
};

describe('BusinessIdentityEngine — staging validation scenarios', () => {
  it('same website host → duplicate', () => {
    const score = computeIdentityScore(
      { ...base, businessName: 'Alpha', website: 'https://shop.example.com' },
      { ...base, businessName: 'Beta Shop', website: 'https://www.shop.example.com/page' },
    );
    expect(score).toBeGreaterThan(95);
    expect(identityDecisionFromScore(score)).toBe('duplicate');
  });

  it('same normalized phone → duplicate', () => {
    const score = computeIdentityScore(
      { ...base, businessName: 'Cafe A', phone: '+61 3 9000 1000' },
      { ...base, businessName: 'Different Name', phone: '0390001000' },
    );
    expect(score).toBeGreaterThan(95);
    expect(identityDecisionFromScore(score)).toBe('duplicate');
  });

  it('same name + close coordinates → duplicate or review', () => {
    const score = computeIdentityScore(
      {
        ...base,
        businessName: 'Lune Croissanterie',
        latitude: -37.8001,
        longitude: 144.978,
      },
      {
        ...base,
        businessName: 'Lune Croissanterie',
        latitude: -37.8002,
        longitude: 144.9781,
      },
    );
    expect(score).toBeGreaterThanOrEqual(70);
    expect(['duplicate', 'review_required']).toContain(identityDecisionFromScore(score));
  });

  it('same name but different suburb/coordinates → review, not duplicate', () => {
    const score = computeIdentityScore(
      {
        ...base,
        businessName: 'Lune Croissanterie',
        latitude: -37.8,
        longitude: 144.98,
      },
      {
        ...base,
        businessName: 'Lune Croissanterie',
        latitude: -37.85,
        longitude: 145.05,
      },
    );
    expect(identityDecisionFromScore(score)).toBe('review_required');
    expect(score).toBeLessThanOrEqual(95);
  });

  it('weak match → unique', () => {
    const score = computeIdentityScore(
      {
        ...base,
        businessName: 'Random Shop',
        phone: '0311111111',
        website: 'https://a.example.com',
      },
      {
        ...base,
        businessName: 'Other Place',
        phone: '0322222222',
        website: 'https://b.example.com',
      },
    );
    expect(identityDecisionFromScore(score)).toBe('unique');
  });
});
