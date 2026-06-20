import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  businessSeedsRequireDatabase,
  businessSeedsPreferFileBackend,
  resetBusinessSeedBackendCacheForTests,
} from '../businessSeedBackend.js';
import {
  listSeedRecords,
  upsertSeedRecords,
  saveSeedRecords,
  resetIngestionStoreForTests,
} from '../IngestionRepository.js';
import type { IngestedSeedRecord } from '../types.js';
import { dbBackfillSeed } from '../businessSeedDbRepository.js';

function makeSeed(overrides: Partial<IngestedSeedRecord> = {}): IngestedSeedRecord {
  const id = overrides.id ?? randomUUID();
  const now = new Date().toISOString();
  const base: IngestedSeedRecord = {
    id,
    normalized: {
      id,
      businessName: 'Test Cafe',
      legalName: null,
      address: '1 Main St',
      phone: '0390001111',
      website: 'https://test-cafe.example.com',
      category: 'food',
      categoryConfidence: 0.8,
      registrationNumber: null,
      email: 'hello@test.com',
      operatingRegion: 'Melbourne',
      country: 'AU',
      state: 'VIC',
      city: 'Melbourne',
      confidenceScore: 0.7,
      sourceType: 'open_data_url',
      sourceReference: 'test-ref',
      sourceRowId: 'row-1',
      ingestedAt: now,
    },
    resolution: 'unique',
    matchEvidence: [],
    qualityScore: 75,
    qualityTier: 'medium_quality',
    verificationStatus: 'seeded_pending_qa',
    claimable: false,
    publicVisibility: 'limited',
    ownerUserId: null,
    storeId: null,
    draftId: null,
    createdAt: now,
    updatedAt: now,
    batchId: 'discovery-job-test',
  };
  return {
    ...base,
    ...overrides,
    normalized: {
      ...base.normalized,
      ...(overrides.normalized ?? {}),
      id: overrides.id ?? base.id,
    },
  };
}

describe('BusinessSeed DB persistence', () => {
  beforeEach(async () => {
    resetBusinessSeedBackendCacheForTests();
    process.env.BUSINESS_SEEDS_BACKEND = 'db';
    delete process.env.BUSINESS_INGESTION_DIR;
    await resetIngestionStoreForTests();
  });

  afterEach(async () => {
    delete process.env.BUSINESS_SEEDS_BACKEND;
    resetBusinessSeedBackendCacheForTests();
    await resetIngestionStoreForTests();
  });

  it('upserts and lists seeds from business_seed table', async () => {
    const seed = makeSeed();
    await upsertSeedRecords([seed]);

    const listed = await listSeedRecords();
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(seed.id);
    expect(listed[0].verificationStatus).toBe('seeded_pending_qa');
    expect(listed[0].storeId).toBeNull();
    expect(listed[0].normalized.businessName).toBe('Test Cafe');
  });

  it('saveSeedRecords syncs full set (removes orphans)', async () => {
    const a = makeSeed({
      id: 'seed-a',
      normalized: { sourceRowId: 'row-a', sourceReference: 'ref-a' },
    });
    const b = makeSeed({
      id: 'seed-b',
      normalized: { sourceRowId: 'row-b', sourceReference: 'ref-b' },
    });
    await saveSeedRecords([a, b]);
    await saveSeedRecords([a]);

    const listed = await listSeedRecords();
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe('seed-a');
  });

  it('backfill preserves id and skips dedupe conflicts', async () => {
    const seed = makeSeed({ id: 'backfill-1' });
    expect(await dbBackfillSeed(seed)).toBe('inserted');
    expect(await dbBackfillSeed(seed)).toBe('updated');

    const otherId = makeSeed({
      id: 'backfill-2',
      normalized: {
        ...seed.normalized,
        id: 'backfill-2',
      },
    });
    expect(await dbBackfillSeed(otherId)).toBe('skipped');
  });
});

describe('businessSeedBackend production policy', () => {
  afterEach(() => {
    delete process.env.BUSINESS_SEEDS_BACKEND;
    delete process.env.BUSINESS_INGESTION_DIR;
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_DATABASE_URL;
    delete process.env.RENDER_EXTERNAL_URL;
    delete process.env.NODE_ENV;
    resetBusinessSeedBackendCacheForTests();
  });

  it('requires database on postgres URL', () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@host/db';
    expect(businessSeedsRequireDatabase()).toBe(true);
  });

  it('allows file backend when BUSINESS_INGESTION_DIR is set (isolated tests)', () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@host/db';
    process.env.BUSINESS_INGESTION_DIR = '/tmp/test-ingestion';
    expect(businessSeedsPreferFileBackend()).toBe(true);
  });
});
