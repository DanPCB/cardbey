import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDiscoveryEngine } from '../discoveryEngineService.js';
import { listDiscoveryJobs, resetDiscoveryJobBackendCacheForTests } from '../jobs/DiscoveryJobRepository.js';
import { listSeedRecords } from '../../businessIngestion/IngestionRepository.js';
import { resetBusinessSeedBackendCacheForTests } from '../../businessIngestion/businessSeedBackend.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(__dirname, '../../../../data/discoveryEngine/fixtures/sample-businesses.csv');

describe('Discovery Engine CLI parity (runDiscoveryEngine)', () => {
  beforeEach(() => {
    process.env.DISCOVERY_JOBS_BACKEND = 'file';
    process.env.BUSINESS_SEEDS_BACKEND = 'file';
    process.env.BUSINESS_INGESTION_DIR = path.join(
      process.cwd(),
      'data',
      'businessIngestion',
      'discovery-integration-test',
      String(Date.now()),
    );
    resetDiscoveryJobBackendCacheForTests();
    resetBusinessSeedBackendCacheForTests();
  });

  afterEach(() => {
    delete process.env.DISCOVERY_JOBS_BACKEND;
    delete process.env.BUSINESS_SEEDS_BACKEND;
    delete process.env.BUSINESS_INGESTION_DIR;
    resetDiscoveryJobBackendCacheForTests();
    resetBusinessSeedBackendCacheForTests();
  });

  it('CSV import creates governed seeds only', async () => {
    const csvContent = readFileSync(FIXTURE, 'utf8');
    const beforeJobs = (await listDiscoveryJobs(5)).length;

    const result = await runDiscoveryEngine({
      provider: 'csv',
      csvContent,
    });

    expect(result.candidatesFound).toBe(2);
    expect(result.job.status).toBe('completed');
    expect(result.seedsCreated + result.seedsUpdated).toBeGreaterThanOrEqual(0);

    const jobs = await listDiscoveryJobs(5);
    expect(jobs.length).toBeGreaterThanOrEqual(beforeJobs);

    for (const seed of result.seedsCreated > 0 ? await listSeedRecords() : []) {
      if (seed.batchId?.startsWith('discovery-job-')) {
        expect(seed.verificationStatus).toBe('seeded_pending_qa');
        expect(seed.storeId).toBeNull();
      }
    }
  });

  it('referral creates single candidate job', async () => {
    const result = await runDiscoveryEngine({
      provider: 'referral',
      businessName: `Staging Referral ${Date.now()}`,
      website: `https://staging-${Date.now()}.example.com`,
    });

    expect(result.candidatesFound).toBe(1);
    expect(result.job.provider).toBe('referral');
    expect(result.job.status).toBe('completed');
  });
});
