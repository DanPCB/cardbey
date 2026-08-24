import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildIngestedSeedRecord } from '../../businessIngestion/SeedGovernance.js';
import type { NormalizedBusinessRecord } from '../../businessIngestion/types.js';
import {
  resetBusinessCandidatesForTests,
  saveBusinessCandidate,
} from '../candidateRepository.js';
import type { BusinessCandidateRecord } from '../types.js';
import { findBusinessCandidateForSeed } from '../media/findBusinessCandidateForSeed.js';
import {
  isEligibleEnrichedHero,
  resolveEnrichedHeroFromCandidate,
  resolvePublicDescription,
} from '../media/resolvePublicCandidatePresentation.js';

function sampleCandidate(overrides: Partial<BusinessCandidateRecord> = {}): BusinessCandidateRecord {
  const now = new Date().toISOString();
  return {
    id: 'cand-public-1',
    batchId: 'MELBOURNE_BATCH001_REAL_LOCAL',
    campaignId: 'cardbey-batch-001-melbourne-west',
    name: 'Braybrook Bakehouse',
    businessType: 'bakery',
    address: '5/227 Ballarat Rd',
    suburb: 'Braybrook',
    city: 'Braybrook',
    state: 'VIC',
    postcode: '3019',
    country: 'AU',
    phone: null,
    website: null,
    email: null,
    socialLinks: [],
    coordinates: null,
    discoveredFrom: 'google',
    confidenceScore: 0.85,
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
    placeId: 'ChIJdyUmDhRe1moR-ioIvTObpHs',
    sourceUrl: null,
    rawSourceJson: null,
    seedId: null,
    status: 'PENDING_QA',
    dedupeKey: 'braybrook bakehouse|braybrook',
    discoveryProviderId: 'google_places',
    externalId: 'ChIJdyUmDhRe1moR-ioIvTObpHs',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function sampleSeed(placeId: string) {
  const normalized: NormalizedBusinessRecord = {
    id: 'seed-row-1',
    businessName: 'Braybrook Bakehouse',
    legalName: null,
    address: '5/227 Ballarat Rd',
    phone: null,
    website: null,
    category: 'food',
    categoryConfidence: 0.7,
    registrationNumber: null,
    email: null,
    operatingRegion: 'AU-VIC',
    country: 'Australia',
    state: 'VIC',
    city: 'Braybrook',
    confidenceScore: 0.8,
    sourceType: 'places_discovery',
    sourceReference: placeId,
    sourceRowId: placeId,
    ingestedAt: new Date().toISOString(),
  };
  return buildIngestedSeedRecord({
    normalized,
    resolution: 'unique',
    matchEvidence: [],
    qualityScore: 70,
    qualityTier: 'medium_quality',
  });
}

describe('public enriched hero eligibility', () => {
  it('allows pexels heroes with representative disclosure', () => {
    const c = sampleCandidate({
      heroImageUrl: 'https://images.pexels.com/photos/1/large.jpg',
      heroImageSource: 'pexels',
    });
    expect(isEligibleEnrichedHero(c)).toBe(true);
    const resolved = resolveEnrichedHeroFromCandidate(c);
    expect(resolved?.heroImageUrl).toContain('pexels.com');
    expect(resolved?.representativeDisclosureRequired).toBe(true);
    expect(resolved?.heroImageSource).toBe('representative');
  });

  it('rejects google_places heroes', () => {
    const c = sampleCandidate({
      heroImageUrl: 'https://maps.googleapis.com/photo',
      heroImageSource: 'google_places',
    });
    expect(isEligibleEnrichedHero(c)).toBe(false);
    expect(resolveEnrichedHeroFromCandidate(c)).toBeNull();
  });
});

describe('findBusinessCandidateForSeed', () => {
  let tmpDir: string;
  const prevDir = process.env.BUSINESS_CANDIDATE_DIR;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'cand-seed-match-'));
    process.env.BUSINESS_CANDIDATE_DIR = tmpDir;
    await resetBusinessCandidatesForTests();
  });

  afterEach(async () => {
    if (prevDir === undefined) delete process.env.BUSINESS_CANDIDATE_DIR;
    else process.env.BUSINESS_CANDIDATE_DIR = prevDir;
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  });

  it('matches Real Local candidate by placeId when seedId is null', async () => {
    const placeId = 'ChIJdyUmDhRe1moR-ioIvTObpHs';
    await saveBusinessCandidate(
      sampleCandidate({
        seedId: null,
        placeId,
        externalId: placeId,
        heroImageUrl: 'https://images.pexels.com/photos/bakery.jpg',
        heroImageSource: 'pexels',
        description: 'Braybrook Bakehouse is a bakery in Braybrook serving fresh bread and cakes.',
      }),
    );
    const seed = sampleSeed(placeId);
    const found = await findBusinessCandidateForSeed(seed);
    expect(found?.placeId).toBe(placeId);
    expect(found?.heroImageSource).toBe('pexels');
    const desc = resolvePublicDescription(seed, found, 'Braybrook, VIC');
    expect(desc).toContain('fresh bread');
    expect(desc.toLowerCase()).not.toContain('claim your profile');
  });
});
