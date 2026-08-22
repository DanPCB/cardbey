import { describe, expect, it } from 'vitest';
import {
  businessCandidateFromIngestedSeed,
  inferRawSourceJsonFromSeed,
} from '../exportSeedsToCandidates.js';
import type { IngestedSeedRecord } from '../../businessIngestion/types.js';

function sampleSeed(overrides: Partial<IngestedSeedRecord> = {}): IngestedSeedRecord {
  return {
    id: 'seed-1',
    normalized: {
      id: 'seed-1',
      businessName: 'Braybrook Hotel',
      legalName: null,
      address: '1 Main Rd',
      phone: null,
      website: null,
      category: 'pub',
      categoryConfidence: 0.8,
      registrationNumber: null,
      email: null,
      operatingRegion: 'Braybrook',
      country: 'AU',
      state: 'VIC',
      city: 'Braybrook',
      confidenceScore: 0.8,
      sourceType: 'places_discovery',
      sourceReference: 'https://maps.example/place',
      sourceRowId: 'place-abc',
      ingestedAt: '2026-08-01T00:00:00.000Z',
    },
    resolution: 'unique',
    matchEvidence: [],
    qualityScore: 80,
    qualityTier: 'medium_quality',
    verificationStatus: 'seeded_claimable',
    claimable: true,
    publicVisibility: 'limited',
    ownerUserId: null,
    storeId: null,
    draftId: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    batchId: 'MELBOURNE_BATCH001_REAL_LOCAL',
    ...overrides,
  };
}

describe('exportSeedsToCandidates', () => {
  it('maps seed verification status to candidate status', () => {
    const candidate = businessCandidateFromIngestedSeed(sampleSeed());
    expect(candidate.status).toBe('CLAIMABLE');
    expect(candidate.seedId).toBe('seed-1');
    expect(candidate.id).toBe('seed:seed-1');
  });

  it('infers rawSourceJson.types from normalized category', () => {
    const raw = inferRawSourceJsonFromSeed(sampleSeed());
    expect(raw?.types).toEqual(['pub']);
  });

  it('maps verified_owner seeds to VERIFIED candidate status', () => {
    const candidate = businessCandidateFromIngestedSeed(
      sampleSeed({ verificationStatus: 'verified_owner' }),
    );
    expect(candidate.status).toBe('VERIFIED');
  });
});
