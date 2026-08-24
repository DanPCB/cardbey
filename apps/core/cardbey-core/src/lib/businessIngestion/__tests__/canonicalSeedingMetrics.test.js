/**
 * Phase 5 — canonical metrics builder smoke test
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { upsertSeedRecords, resetIngestionDataForTests } from '../IngestionRepository.js';
import { buildIngestedSeedRecord } from '../SeedGovernance.js';
import { buildCanonicalSeedingMetrics, SEEDING_METRICS_SOURCE } from '../buildCanonicalSeedingMetrics.js';

describe('buildCanonicalSeedingMetrics', () => {
  beforeEach(async () => {
    process.env.BUSINESS_INGESTION_DIR = path.join(
      process.cwd(),
      'data',
      'businessIngestion',
      'metrics-test',
      String(Date.now()),
    );
    process.env.BUSINESS_SEEDS_BACKEND = 'file';
    await resetIngestionDataForTests();
  });

  afterEach(async () => {
    delete process.env.BUSINESS_INGESTION_DIR;
    delete process.env.BUSINESS_SEEDS_BACKEND;
  });

  it('returns funnel aliases and sourceOfTruth', async () => {
    const now = new Date().toISOString();
    const seed = buildIngestedSeedRecord({
      normalized: {
        id: 'm1',
        businessName: 'Metrics Cafe',
        legalName: null,
        address: '1 St',
        phone: null,
        website: 'https://example.com',
        category: 'cafe',
        categoryConfidence: 0.8,
        registrationNumber: null,
        email: null,
        operatingRegion: 'AU-VIC',
        country: 'Australia',
        state: 'VIC',
        city: 'Melbourne',
        confidenceScore: 0.8,
        sourceType: 'open_data_url',
        sourceReference: 'MELBOURNE_BATCH0_20260617',
        sourceRowId: '1',
        ingestedAt: now,
      },
      resolution: 'unique',
      matchEvidence: [],
      qualityScore: 80,
      qualityTier: 'high_quality',
      batchId: 'MELBOURNE_BATCH0_20260617',
    });
    await upsertSeedRecords([seed]);

    const payload = await buildCanonicalSeedingMetrics();
    expect(payload.ok).toBe(true);
    expect(payload.sourceOfTruth).toBe(SEEDING_METRICS_SOURCE);
    expect(payload.canonicalPath).toBe('/api/business-ingestion/metrics');
    expect(payload.discoverySeeds).toBe(1);
    expect(payload.metrics.discoverySeeds).toBe(1);
    expect(payload.metrics.pilotBatches?.some((b) => b.batchId === 'MELBOURNE_BATCH0_20260617')).toBe(
      true,
    );
  });
});
