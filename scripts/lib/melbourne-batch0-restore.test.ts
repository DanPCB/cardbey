import { describe, expect, it } from 'vitest';
import {
  findExistingSeed,
  indexExistingSeeds,
  mergeIncomingSeed,
  reconcileIngestionSeeds,
} from '../../apps/core/cardbey-core/src/lib/businessIngestion/seedIdempotency.ts';
import {
  MELBOURNE_BATCH0_EXPECTED_DISCOVERED,
  MELBOURNE_BATCH0_ID,
  buildBatchNameIndex,
  buildMelbourneBatchRestoreMetrics,
  captureGovernanceSnapshot,
  findDuplicateBatchNames,
  normalizeBatchBusinessName,
  reconcileMelbourneBatchRestore,
  validateGovernancePreserved,
  validateMelbourneBatchRestoreAcceptance,
} from './melbourne-batch0-restore.ts';
import type { IngestedSeedRecord } from './discovery-data-audit.ts';

function factualDigest(seed: IngestedSeedRecord): string {
  const n = seed.normalized;
  return JSON.stringify({
    businessName: n.businessName,
    legalName: n.legalName,
    address: n.address,
    phone: n.phone,
    website: n.website,
    category: n.category,
    registrationNumber: n.registrationNumber,
    email: n.email,
    operatingRegion: n.operatingRegion,
    country: n.country,
    state: n.state,
    city: n.city,
    qualityScore: seed.qualityScore,
    qualityTier: seed.qualityTier,
    resolution: seed.resolution,
    sourceType: n.sourceType,
    sourceReference: n.sourceReference,
    sourceRowId: n.sourceRowId,
  });
}

const reconcileFns = {
  reconcileIngestionSeeds,
  findExistingSeed,
  indexExistingSeeds,
  mergeIncomingSeed,
  factualDigest,
};

function seed(partial: Partial<IngestedSeedRecord> & { id: string }): IngestedSeedRecord {
  const baseNormalized = {
    id: partial.id,
    businessName: 'Brunetti Carlton',
    legalName: null,
    address: '380 Lygon Street, Carlton',
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
    sourceType: 'csv' as const,
    sourceReference: MELBOURNE_BATCH0_ID,
    sourceRowId: '1',
    ingestedAt: '2026-06-17T00:00:00.000Z',
  };

  return {
    qualityScore: 88,
    qualityTier: 'high_quality',
    resolution: 'unique',
    matchEvidence: [],
    verificationStatus: 'seeded_pending_qa',
    claimable: false,
    publicVisibility: 'limited',
    ownerUserId: null,
    storeId: null,
    draftId: null,
    createdAt: '2026-06-17T00:00:00.000Z',
    updatedAt: '2026-06-17T00:00:00.000Z',
    batchId: MELBOURNE_BATCH0_ID,
    normalized: baseNormalized,
    ...partial,
    normalized: { ...baseNormalized, ...(partial.normalized ?? {}) },
  };
}

describe('melbourne-batch0-restore', () => {
  it('detects duplicate business names in batch', () => {
    const dupes = findDuplicateBatchNames([
      seed({ id: 'a' }),
      seed({ id: 'b' }),
    ]);
    expect(dupes).toEqual(['brunetti carlton']);
  });

  it('validates acceptance: discovered 10, no duplicates', () => {
    const acceptance = validateMelbourneBatchRestoreAcceptance({
      discovered: 10,
      pendingQa: 0,
      claimable: 10,
      verified: 0,
      activated: 0,
      operating: 0,
      duplicateNames: [],
    });
    expect(acceptance.ok).toBe(true);
  });

  it('preserves claimable governance snapshot after restore', () => {
    const existing = seed({
      id: 'gen-store-1',
      verificationStatus: 'seeded_claimable',
      claimable: true,
    });
    const snap = captureGovernanceSnapshot([existing]);
    const preserved = validateGovernancePreserved(snap, [existing]);
    expect(preserved.ok).toBe(true);
  });

  it('matches incoming pilot row to existing batch seed by business name', () => {
    const existing = seed({
      id: 'gen-store-1',
      verificationStatus: 'seeded_claimable',
      claimable: true,
    });

    const incoming = seed({
      id: 'new-random-id',
      verificationStatus: 'seeded_pending_qa',
      claimable: false,
      normalized: {
        id: 'new-random-id',
        businessName: 'Brunetti Carlton',
        legalName: null,
        address: '380 Lygon Street, Carlton',
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
        sourceReference: MELBOURNE_BATCH0_ID,
        sourceRowId: 'MB0-01',
        ingestedAt: '2026-06-17T00:00:00.000Z',
      },
    });

    const result = reconcileMelbourneBatchRestore([incoming], [existing], reconcileFns);
    expect(result.seedsCreated).toBe(0);
    expect(result.seeds[0].id).toBe('gen-store-1');
    expect(result.seeds[0].verificationStatus).toBe('seeded_claimable');
    expect(result.seeds[0].claimable).toBe(true);
  });

  it('buildBatchNameIndex normalizes names', () => {
    const index = buildBatchNameIndex([
      seed({
        id: '1',
        normalized: {
          ...seed({ id: '1' }).normalized,
          businessName: '  Yoga   213 ',
        },
      }),
    ]);
    expect(index.get('yoga 213')?.id).toBe('1');
    expect(normalizeBatchBusinessName("Pellegrini's Espresso Bar")).toBe("pellegrini's espresso bar");
  });

  it('buildMelbourneBatchRestoreMetrics counts batch seeds only', () => {
    const metrics = buildMelbourneBatchRestoreMetrics([
      seed({ id: 'mel-1', verificationStatus: 'seeded_claimable', claimable: true }),
      seed({
        id: 'other-1',
        batchId: null,
        normalized: {
          ...seed({ id: 'other-1' }).normalized,
          sourceReference: 'other-batch',
        },
      }),
    ]);
    expect(metrics.discovered).toBe(1);
    expect(metrics.claimable).toBe(1);
    expect(MELBOURNE_BATCH0_EXPECTED_DISCOVERED).toBe(10);
  });
});
