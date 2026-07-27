import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  ingestionRunsRequireDatabase,
  ingestionRunsPreferFileBackend,
  resetIngestionRunBackendCacheForTests,
  resolveIngestionRunBackend,
} from '../businessIngestionRunBackend.js';
import prisma from '../../prisma.js';
import {
  appendIngestionRunMetrics,
  backfillIngestionRun,
  createRun,
  getRun,
  listIngestionRunMetrics,
  listRuns,
  resetIngestionRunsForTests,
  summarizeRun,
} from '../BusinessIngestionRunRepository.js';
import { resetIngestionStoreForTests } from '../IngestionRepository.js';
import type { IngestionRunMetrics } from '../types.js';

function makeMetrics(overrides: Partial<IngestionRunMetrics> = {}): IngestionRunMetrics {
  const runId = overrides.runId ?? randomUUID();
  const now = new Date().toISOString();
  return {
    runId,
    sourceType: 'open_data_url',
    sourceReference: 'test-ref',
    startedAt: now,
    completedAt: now,
    recordsFetched: 10,
    recordsNormalized: 10,
    duplicatesRemoved: 2,
    possibleDuplicates: 1,
    uniqueRecords: 7,
    seedsCreated: 5,
    seedsUpdated: 2,
    seedsSkippedExisting: 0,
    businessStoresPersisted: 0,
    qualityBreakdown: {
      high_quality: 3,
      medium_quality: 4,
      low_quality: 0,
    },
    sourceBreakdown: { open_data_url: 10 },
    claimRate: 0,
    verificationRate: 0,
    ...overrides,
  };
}

describe('BusinessIngestionRun DB persistence', () => {
  beforeEach(async () => {
    resetIngestionRunBackendCacheForTests();
    process.env.BUSINESS_INGESTION_RUNS_BACKEND = 'db';
    delete process.env.BUSINESS_INGESTION_DIR;
    await resetIngestionRunsForTests();
  });

  afterEach(async () => {
    delete process.env.BUSINESS_INGESTION_RUNS_BACKEND;
    resetIngestionRunBackendCacheForTests();
    await resetIngestionRunsForTests();
  });

  it('persists and lists ingestion runs in business_ingestion_run table', async () => {
    const metrics = makeMetrics({ runId: 'run-persist-1' });
    await appendIngestionRunMetrics(metrics);

    const listed = await listIngestionRunMetrics();
    expect(listed).toHaveLength(1);
    expect(listed[0].runId).toBe('run-persist-1');
    expect(listed[0].seedsCreated).toBe(5);
    expect(listed[0].businessStoresPersisted).toBe(0);
  });

  it('createRun, getRun, and summarizeRun work', async () => {
    const now = new Date().toISOString();
    const record = await createRun({
      id: 'run-create-1',
      source: 'osm',
      status: 'completed',
      startedAt: now,
      completedAt: now,
      candidateCount: 12,
      seedCount: 4,
      duplicateCount: 3,
    });

    const fetched = await getRun('run-create-1');
    expect(fetched?.id).toBe(record.id);
    expect(fetched?.seedCount).toBe(4);

    const summary = summarizeRun(record);
    expect(summary.candidateCount).toBe(12);
    expect(summary.durationMs).toBe(0);
  });

  it('backfill preserves id and updates duplicates safely', async () => {
    const metrics = makeMetrics({ runId: 'backfill-run-1' });
    expect(await backfillIngestionRun(metrics)).toBe('inserted');
    expect(await backfillIngestionRun(metrics)).toBe('updated');

    const runs = await listRuns();
    expect(runs.filter((r) => r.id === 'backfill-run-1')).toHaveLength(1);
  });
});

describe('businessIngestionRunBackend production policy', () => {
  afterEach(() => {
    delete process.env.BUSINESS_INGESTION_RUNS_BACKEND;
    delete process.env.BUSINESS_SEEDS_BACKEND;
    delete process.env.BUSINESS_INGESTION_DIR;
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_DATABASE_URL;
    delete process.env.RENDER_EXTERNAL_URL;
    delete process.env.NODE_ENV;
    resetIngestionRunBackendCacheForTests();
  });

  it('requires database on postgres URL', () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@host/db';
    expect(ingestionRunsRequireDatabase()).toBe(true);
  });

  it('allows file backend when BUSINESS_INGESTION_DIR is set (isolated tests)', () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@host/db';
    process.env.BUSINESS_INGESTION_DIR = '/tmp/test-ingestion';
    expect(ingestionRunsPreferFileBackend()).toBe(true);
  });

  it('never prefers file backend on Render production', () => {
    process.env.NODE_ENV = 'production';
    process.env.RENDER_EXTERNAL_URL = 'https://cardbey.onrender.com';
    process.env.DATABASE_URL = 'postgresql://user:pass@host/db';
    expect(ingestionRunsPreferFileBackend()).toBe(false);
    expect(ingestionRunsRequireDatabase()).toBe(true);
  });

  it('throws instead of falling back to runs.json when postgres requires db but table missing', async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@host/db';
    process.env.BUSINESS_INGESTION_RUNS_BACKEND = 'db';
    delete process.env.BUSINESS_INGESTION_DIR;
    resetIngestionRunBackendCacheForTests();

    const original = prisma.businessIngestionRun.findFirst;
    prisma.businessIngestionRun.findFirst = (async () => {
      throw new Error('The table `main.business_ingestion_run` does not exist');
    }) as typeof original;

    await expect(resolveIngestionRunBackend()).rejects.toThrow(
      'business_ingestion_run table is missing',
    );

    prisma.businessIngestionRun.findFirst = original;
  });
});

describe('IngestionRepository run integration', () => {
  beforeEach(async () => {
    resetIngestionRunBackendCacheForTests();
    process.env.BUSINESS_SEEDS_BACKEND = 'db';
    process.env.BUSINESS_INGESTION_RUNS_BACKEND = 'db';
    delete process.env.BUSINESS_INGESTION_DIR;
    await resetIngestionStoreForTests();
  });

  afterEach(async () => {
    delete process.env.BUSINESS_SEEDS_BACKEND;
    delete process.env.BUSINESS_INGESTION_RUNS_BACKEND;
    resetIngestionRunBackendCacheForTests();
    await resetIngestionStoreForTests();
  });

  it('resetIngestionStoreForTests clears seeds and runs in db mode', async () => {
    await appendIngestionRunMetrics(makeMetrics({ runId: 'reset-test-run' }));
    expect(await listIngestionRunMetrics()).toHaveLength(1);

    await resetIngestionStoreForTests();
    expect(await listIngestionRunMetrics()).toHaveLength(0);
  });
});
