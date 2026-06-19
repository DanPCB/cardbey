import { describe, expect, it } from 'vitest';
import {
  computeIdentityScore,
  identityDecisionFromScore,
} from '../dedupe/BusinessIdentityEngine.js';

describe('BusinessIdentityEngine', () => {
  it('classifies exact website match as duplicate threshold', () => {
    const score = computeIdentityScore(
      {
        businessName: 'Lune Croissanterie',
        phone: null,
        email: null,
        website: 'https://lunecroissant.com.au',
        latitude: -37.8,
        longitude: 144.98,
      },
      {
        businessName: 'Lune Bakery',
        phone: null,
        email: null,
        website: 'https://www.lunecroissant.com.au/menu',
        latitude: -37.8,
        longitude: 144.98,
      },
    );
    expect(score).toBeGreaterThan(70);
    expect(identityDecisionFromScore(score)).not.toBe('unique');
  });

  it('returns unique for unrelated businesses', () => {
    const score = computeIdentityScore(
      {
        businessName: 'Alpha Cafe',
        phone: '0399991111',
        email: null,
        website: 'https://alpha.example',
        latitude: null,
        longitude: null,
      },
      {
        businessName: 'Beta Restaurant',
        phone: '0388882222',
        email: null,
        website: 'https://beta.example',
        latitude: null,
        longitude: null,
      },
    );
    expect(identityDecisionFromScore(score)).toBe('unique');
  });

  it('uses threshold boundaries', () => {
    expect(identityDecisionFromScore(96)).toBe('duplicate');
    expect(identityDecisionFromScore(80)).toBe('review_required');
    expect(identityDecisionFromScore(50)).toBe('unique');
  });
});
