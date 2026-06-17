import { describe, it, expect } from 'vitest';
import { buildIngestedSeedRecord } from '../SeedGovernance.js';
import {
  buildSourceKey,
  buildIdentityFingerprint,
  reconcileIngestionSeeds,
} from '../seedIdempotency.js';
import type { NormalizedBusinessRecord } from '../types.js';

function norm(overrides: Partial<NormalizedBusinessRecord> = {}): NormalizedBusinessRecord {
  const now = new Date().toISOString();
  return {
    id: overrides.id ?? 'n-1',
    businessName: 'Acme Cafe',
    legalName: null,
    address: '1 High St',
    phone: '+61400111222',
    website: 'https://acme.example.com',
    category: 'cafe',
    categoryConfidence: 0.8,
    registrationNumber: null,
    email: null,
    operatingRegion: null,
    country: null,
    state: null,
    city: 'Melbourne',
    confidenceScore: 0.8,
    sourceType: 'open_data_url',
    sourceReference: 'fixture.json',
    sourceRowId: '42',
    ingestedAt: now,
    ...overrides,
  };
}

describe('seedIdempotency', () => {
  it('builds stable source and identity keys', () => {
    const n = norm();
    expect(buildSourceKey(n)).toBe('open_data_url|fixture.json|42');
    expect(buildIdentityFingerprint(n)).toContain('acme cafe');
  });

  it('skips unchanged re-ingest of same source row', () => {
    const n = norm({ id: 'existing-norm-id' });
    const existing = buildIngestedSeedRecord({
      normalized: n,
      resolution: 'unique',
      matchEvidence: [],
      qualityScore: 90,
      qualityTier: 'high_quality',
    });
    existing.id = 'seed-existing-1';
    existing.createdAt = '2026-01-01T00:00:00.000Z';

    const incomingNorm = norm({ id: 'new-random-id' });
    const incoming = buildIngestedSeedRecord({
      normalized: incomingNorm,
      resolution: 'unique',
      matchEvidence: [],
      qualityScore: 90,
      qualityTier: 'high_quality',
    });

    const result = reconcileIngestionSeeds([incoming], [existing]);
    expect(result.seedsCreated).toBe(0);
    expect(result.seedsSkippedExisting).toBe(1);
    expect(result.seeds[0].id).toBe('seed-existing-1');
    expect(result.seeds[0].verificationStatus).toBe('seeded_pending_qa');
  });

  it('updates when factual data changed', () => {
    const n = norm({ phone: '+61400111222' });
    const existing = buildIngestedSeedRecord({
      normalized: n,
      resolution: 'unique',
      matchEvidence: [],
      qualityScore: 90,
      qualityTier: 'high_quality',
    });
    existing.id = 'seed-update-1';

    const incomingNorm = norm({ id: 'new-id', phone: '+61400999888' });
    const incoming = buildIngestedSeedRecord({
      normalized: incomingNorm,
      resolution: 'unique',
      matchEvidence: [],
      qualityScore: 85,
      qualityTier: 'high_quality',
    });

    const result = reconcileIngestionSeeds([incoming], [existing]);
    expect(result.seedsUpdated).toBe(1);
    expect(result.seeds[0].id).toBe('seed-update-1');
    expect(result.seeds[0].normalized.phone).toBe('+61400999888');
  });
});
