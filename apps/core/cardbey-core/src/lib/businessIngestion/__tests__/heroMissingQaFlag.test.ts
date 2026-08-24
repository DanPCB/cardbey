import { describe, it, expect, beforeEach } from 'vitest';
import {
  suggestAutoApproval,
  canPromoteToClaimable,
  QA_FLAG_HERO_MISSING,
} from '../QaQualityGates.js';
import type { IngestedSeedRecord } from '../types.js';

function makeSeed(overrides: Partial<IngestedSeedRecord> = {}): IngestedSeedRecord {
  const now = new Date().toISOString();
  return {
    id: 'hero-1',
    normalized: {
      id: 'hero-1',
      businessName: 'Brunetti Carlton',
      legalName: null,
      address: '380 Lygon',
      phone: '+61393495200',
      website: 'https://brunetti.com.au',
      category: 'cafe',
      categoryConfidence: 0.9,
      registrationNumber: null,
      email: 'carlton@brunetti.com.au',
      operatingRegion: 'AU-VIC',
      country: 'Australia',
      state: 'VIC',
      city: 'Melbourne',
      confidenceScore: 0.9,
      sourceType: 'open_data_url',
      sourceReference: 'MELBOURNE_BATCH0_20260617',
      sourceRowId: '1',
      ingestedAt: now,
    },
    resolution: 'unique',
    matchEvidence: [],
    qualityScore: 90,
    qualityTier: 'high_quality',
    verificationStatus: 'seeded_pending_qa',
    claimable: false,
    publicVisibility: 'limited',
    ownerUserId: null,
    storeId: null,
    draftId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('HERO_MISSING QA flag', () => {
  it('blocks auto-suggest and promote when HERO_MISSING is set', () => {
    const seed = makeSeed({ qaFlags: [QA_FLAG_HERO_MISSING] });
    const suggest = suggestAutoApproval(seed);
    expect(suggest.suggested).toBe(false);
    expect(suggest.reasons.some((r) => r.includes('HERO_MISSING'))).toBe(true);

    const gate = canPromoteToClaimable(seed);
    expect(gate.ok).toBe(false);
    expect(gate.message).toMatch(/HERO_MISSING/);
  });

  it('allows promote when flag cleared', () => {
    const seed = makeSeed({ qaFlags: [] });
    expect(suggestAutoApproval(seed).suggested).toBe(true);
    expect(canPromoteToClaimable(seed).ok).toBe(true);
  });
});
