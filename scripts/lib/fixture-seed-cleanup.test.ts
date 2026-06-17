import { describe, expect, it } from 'vitest';
import {
  MELBOURNE_BATCH0_ID,
  computeSeedMetrics,
  isFixtureSeedDeleteCandidate,
  isMelbourneBatch0Seed,
} from './fixture-seed-cleanup.ts';
import type { IngestedSeedRecord } from './discovery-data-audit.ts';

const emptyCtx = { seeds: [], claims: [], enrichmentCandidates: [], suitcases: [] };

function seed(partial: Partial<IngestedSeedRecord> & { id: string }): IngestedSeedRecord {
  return {
    qualityScore: 80,
    resolution: 'unique',
    verificationStatus: 'seeded_pending_qa',
    claimable: false,
    ownerUserId: null,
    createdAt: '2026-06-17T00:00:00.000Z',
    updatedAt: '2026-06-17T00:00:00.000Z',
    normalized: {
      businessName: 'Test',
      sourceType: 'open_data_url',
      sourceReference: 'file://sample-opendata-businesses.json',
      sourceRowId: '1',
      email: null,
      city: null,
    },
    ...partial,
  };
}

describe('fixture-seed-cleanup', () => {
  it('preserves Melbourne Batch 0 seeds', () => {
    const melbourne = seed({
      id: 'mel-1',
      batchId: MELBOURNE_BATCH0_ID,
      normalized: {
        businessName: 'Melbourne Cafe',
        sourceType: 'csv',
        sourceReference: MELBOURNE_BATCH0_ID,
        sourceRowId: '1',
        email: null,
        city: 'Melbourne',
      },
    });
    expect(isMelbourneBatch0Seed(melbourne)).toBe(true);
    expect(isFixtureSeedDeleteCandidate(melbourne, emptyCtx).delete).toBe(false);
  });

  it('marks Sample Business fixture seeds for deletion', () => {
    const fixture = seed({
      id: 'fix-1',
      normalized: {
        businessName: 'Sample Business 14',
        sourceType: 'open_data_url',
        sourceReference:
          'file://C:/Projects/cardbey/apps/core/cardbey-core/data/businessIngestion/fixtures/sample-opendata-businesses.json',
        sourceRowId: '14',
        email: null,
        city: 'Brisbane',
      },
    });
    const verdict = isFixtureSeedDeleteCandidate(fixture, emptyCtx);
    expect(verdict.delete).toBe(true);
    expect(verdict.reason).toMatch(/sample_business|test_source|open_data_fixture/);
  });

  it('preserves verified seeds and deletes fixture claimable seeds', () => {
    const verified = seed({
      id: 'v-1',
      verificationStatus: 'verified_owner',
      ownerUserId: 'user-1',
    });
    expect(isFixtureSeedDeleteCandidate(verified, emptyCtx).delete).toBe(false);

    const fixtureClaimable = seed({
      id: 'c-1',
      verificationStatus: 'seeded_claimable',
      claimable: true,
      normalized: {
        businessName: 'Sample Business 99',
        sourceType: 'open_data_url',
        sourceReference: 'file://fixtures/sample-opendata-businesses.json',
        sourceRowId: '99',
        email: null,
        city: null,
      },
    });
    expect(isFixtureSeedDeleteCandidate(fixtureClaimable, emptyCtx).delete).toBe(true);
  });

  it('projects metrics after fixture removal', () => {
    const before = [
      seed({ id: 'f1', normalized: { ...seed({ id: 'x' }).normalized, businessName: 'Sample Business 1' } }),
      seed({
        id: 'm1',
        batchId: MELBOURNE_BATCH0_ID,
        normalized: {
          businessName: 'Real Melbourne Shop',
          sourceType: 'csv',
          sourceReference: MELBOURNE_BATCH0_ID,
          sourceRowId: '1',
          email: null,
          city: 'Melbourne',
        },
      }),
    ];
    const deleteIds = new Set(
      before.filter((s) => isFixtureSeedDeleteCandidate(s, emptyCtx).delete).map((s) => s.id),
    );
    const after = before.filter((s) => !deleteIds.has(s.id));
    expect(computeSeedMetrics(before).pendingQa).toBe(2);
    expect(computeSeedMetrics(after).pendingQa).toBe(1);
    expect(computeSeedMetrics(after).discovered).toBe(1);
  });
});
