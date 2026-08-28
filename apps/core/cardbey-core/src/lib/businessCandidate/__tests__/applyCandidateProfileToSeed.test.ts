import { describe, it, expect } from 'vitest';
import { canPromoteToClaimable } from '../../businessIngestion/QaQualityGates.js';
import { persistSeedCompletenessOnRecord } from '../../ingestion/persistSeedCompleteness.js';
import type { IngestedSeedRecord } from '../../businessIngestion/types.js';
import type { BusinessCandidateRecord } from '../types.js';
import {
  applyCandidateProfileToSeed,
  resolveHeroForSeedPromotion,
} from '../applyCandidateProfileToSeed.js';

function makeSeed(overrides: Partial<IngestedSeedRecord> = {}): IngestedSeedRecord {
  const now = new Date().toISOString();
  const base = persistSeedCompletenessOnRecord({
    id: 'seed-qa-1',
    normalized: {
      id: 'seed-qa-1',
      businessName: 'Braybrook Bakehouse',
      legalName: null,
      address: '12 Main St, Braybrook VIC',
      phone: '+61390000000',
      website: 'https://braybrook.example',
      category: 'bakery',
      categoryConfidence: 0.9,
      registrationNumber: null,
      email: null,
      operatingRegion: 'AU-VIC',
      country: 'Australia',
      state: 'VIC',
      city: 'Braybrook',
      confidenceScore: 0.9,
      sourceType: 'places_discovery',
      sourceReference: 'MELBOURNE_BATCH001_REAL_LOCAL',
      sourceRowId: 'place-1',
      ingestedAt: now,
    },
    resolution: 'unique',
    matchEvidence: [],
    qualityScore: 85,
    qualityTier: 'high_quality',
    verificationStatus: 'seeded_pending_qa',
    claimable: false,
    publicVisibility: 'limited',
    ownerUserId: null,
    storeId: null,
    draftId: null,
    createdAt: now,
    updatedAt: now,
    qaFlags: ['HERO_MISSING'],
    ...overrides,
  }).seed;
  return base;
}

function makeCandidate(overrides: Partial<BusinessCandidateRecord> = {}): BusinessCandidateRecord {
  const now = new Date().toISOString();
  return {
    id: 'cand-1',
    batchId: 'MELBOURNE_BATCH001_REAL_LOCAL',
    campaignId: null,
    name: 'Braybrook Bakehouse',
    businessType: 'bakery',
    address: '12 Main St',
    suburb: 'Braybrook',
    city: 'Braybrook',
    state: 'VIC',
    postcode: '3019',
    country: 'Australia',
    phone: '+61390000000',
    website: 'https://braybrook.example',
    email: null,
    socialLinks: [],
    coordinates: null,
    discoveredFrom: 'google',
    confidenceScore: 0.9,
    originalContent: {},
    fetchedImages: [],
    fetchedMenu: null,
    fetchedServices: [],
    missingFields: [],
    ownerMatched: false,
    ownerId: null,
    storeDraftId: null,
    storeId: null,
    missionId: null,
    placeId: 'place-1',
    sourceUrl: null,
    rawSourceJson: null,
    seedId: null,
    status: 'PENDING_QA',
    dedupeKey: 'dedupe-1',
    discoveryProviderId: 'google_places',
    externalId: 'place-1',
    createdAt: now,
    updatedAt: now,
    heroImageUrl: 'https://cdn.example/hero-bakery.jpg',
    heroImageSource: 'pexels',
    description: 'Artisan sourdough and pastries in Braybrook.',
    openingHours: '{"monday":"7am-3pm"}',
    ...overrides,
  };
}

describe('applyCandidateProfileToSeed', () => {
  it('copies enriched hero onto seed and clears HERO_MISSING approve blockers', async () => {
    const seed = makeSeed();
    expect(canPromoteToClaimable(seed).ok).toBe(false);

    const patched = await applyCandidateProfileToSeed(makeCandidate(), seed);

    expect(patched.hero?.url).toBe('https://cdn.example/hero-bakery.jpg');
    expect(patched.enrichmentProfile?.heroImageUrl).toBe('https://cdn.example/hero-bakery.jpg');
    expect(patched.qaFlags ?? []).not.toContain('HERO_MISSING');
    expect(canPromoteToClaimable(patched).ok).toBe(true);
  });

  it('resolveHeroForSeedPromotion prefers candidate.heroImageUrl', async () => {
    const hero = await resolveHeroForSeedPromotion(
      makeCandidate({
        heroImageUrl: 'https://cdn.example/direct.jpg',
        heroImageSource: 'business_website',
      }),
    );
    expect(hero?.url).toBe('https://cdn.example/direct.jpg');
    expect(hero?.provenance).toBe('website_extraction');
  });
});
