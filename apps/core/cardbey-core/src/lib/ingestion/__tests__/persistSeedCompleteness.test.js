import path from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import { persistSeedCompleteness, scoreSeedRecord } from '../persistSeedCompleteness.js';
import { buildIngestedSeedRecord } from '../../businessIngestion/SeedGovernance.js';
import { upsertSeedRecords, resetIngestionDataForTests, getSeedRecordById } from '../../businessIngestion/IngestionRepository.js';

describe('persistSeedCompleteness', () => {
  beforeEach(async () => {
    process.env.BUSINESS_INGESTION_DIR = path.join(
      process.cwd(),
      'data',
      'businessIngestion',
      'completeness-test',
      String(Date.now()),
    );
    await resetIngestionDataForTests();
  });

  it('is idempotent for the same seed and completenessCheckedAt is monotonic', async () => {
    const seed = buildIngestedSeedRecord({
      normalized: {
        id: 'c-1',
        businessName: 'Acme',
        legalName: null,
        address: '1 High',
        phone: null,
        website: null,
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
        sourceReference: 'test',
        sourceRowId: '1',
        ingestedAt: new Date().toISOString(),
      },
      resolution: 'unique',
      matchEvidence: [],
      qualityScore: 80,
      qualityTier: 'high_quality',
    });
    await upsertSeedRecords([seed]);

    const first = await persistSeedCompleteness(seed.id);
    expect(first.ok).toBe(true);
    const firstScore = scoreSeedRecord(first.seed);
    expect(first.completeness.tier).toBe(firstScore.tier);
    expect(first.completeness.blockers).toEqual(firstScore.blockers);

    const second = await persistSeedCompleteness(seed.id);
    expect(second.completeness.tier).toBe(first.completeness.tier);
    expect(second.completeness.blockers).toEqual(first.completeness.blockers);
    expect(second.completeness.score).toBe(first.completeness.score);
    expect(Date.parse(second.seed.completenessCheckedAt)).toBeGreaterThanOrEqual(
      Date.parse(first.seed.completenessCheckedAt),
    );

    const stored = await getSeedRecordById(seed.id);
    expect(stored?.completenessTier).toBe(first.completeness.tier);
  });
});
