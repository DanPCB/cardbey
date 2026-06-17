import path from 'node:path';
import { describe, expect, it, beforeEach } from 'vitest';
import { buildIngestedSeedRecord } from '../SeedGovernance.js';
import { approveSeed } from '../QaPromotionService.js';
import { upsertSeedRecords, resetIngestionDataForTests } from '../IngestionRepository.js';
import {
  generateAndStoreBiSnapshotForSeed,
  getPublicBusinessSnapshotForSeed,
  recordActivationReportView,
  migrateSeedSuitcaseToBusinessSpace,
  buildDiscoveryIntelligenceMetrics,
} from '../seedSuitcaseService.js';
import { getSeedSuitcase } from '../seedSuitcaseStore.js';
import type { NormalizedBusinessRecord } from '../types.js';

function makeNormalized(): NormalizedBusinessRecord {
  const now = new Date().toISOString();
  return {
    id: 'suitcase-seed-1',
    businessName: 'Snapshot Cafe',
    legalName: null,
    address: '1 Main St',
    phone: '+61400111222',
    website: 'https://snapshot.example.com',
    category: 'cafe',
    categoryConfidence: 0.8,
    registrationNumber: null,
    email: null,
    operatingRegion: 'AU',
    country: 'Australia',
    state: 'VIC',
    city: 'Melbourne',
    confidenceScore: 0.75,
    sourceType: 'open_data_url',
    sourceReference: 'fixture',
    sourceRowId: '1',
    ingestedAt: now,
  };
}

describe('Seed Suitcase V3', () => {
  beforeEach(async () => {
    process.env.BUSINESS_INGESTION_DIR = path.join(
      process.cwd(),
      'data',
      'businessIngestion',
      'seed-suitcase-test',
      String(Date.now()),
    );
    await resetIngestionDataForTests();
  });

  it('stores BI snapshot in seed suitcase on QA approval', async () => {
    const seed = buildIngestedSeedRecord({
      normalized: makeNormalized(),
      resolution: 'unique',
      matchEvidence: [],
      qualityScore: 90,
      qualityTier: 'high_quality',
    });
    await upsertSeedRecords([seed]);

    const result = await approveSeed(seed.id, 'admin-1');
    expect(result.ok).toBe(true);

    const suitcase = await getSeedSuitcase(seed.id);
    expect(suitcase?.biSnapshot?.snapshotId).toBeTruthy();
    expect(suitcase?.activationNarrative?.activationPath).toBe(`/activate-business/${seed.id}`);
  });

  it('exposes public business snapshot and tracks report views', async () => {
    const seed = buildIngestedSeedRecord({
      normalized: makeNormalized(),
      resolution: 'unique',
      matchEvidence: [],
      qualityScore: 90,
      qualityTier: 'high_quality',
    });
    await generateAndStoreBiSnapshotForSeed(seed);

    const pub = await getPublicBusinessSnapshotForSeed(seed.id);
    expect(pub?.visibilityScore).toBeGreaterThan(0);
    expect(pub?.campaignMessage).toMatch(/Business Snapshot/);

    const view = await recordActivationReportView(seed.id);
    expect(view.ok).toBe(true);
    expect(view.viewCount).toBe(1);

    const metrics = await buildDiscoveryIntelligenceMetrics();
    expect(metrics.snapshotsGenerated).toBe(1);
    expect(metrics.activationReportViews).toBe(1);
  });

  it('migrates seed suitcase into business space briefing on activation', async () => {
    const seed = buildIngestedSeedRecord({
      normalized: makeNormalized(),
      resolution: 'unique',
      matchEvidence: [],
      qualityScore: 90,
      qualityTier: 'high_quality',
    });
    await generateAndStoreBiSnapshotForSeed(seed);
    await recordActivationReportView(seed.id);

    const migration = await migrateSeedSuitcaseToBusinessSpace({
      seedId: seed.id,
      storeId: 'store-99',
    });
    expect(migration.ok).toBe(true);
    expect(migration.briefing?.openingLine).toMatch(/We analyzed your business/);
    expect(migration.suitcase?.migratedToStoreId).toBe('store-99');
  });
});
