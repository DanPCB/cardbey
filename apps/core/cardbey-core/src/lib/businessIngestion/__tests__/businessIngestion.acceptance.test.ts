/**
 * Business Ingestion Foundation — acceptance test (Initial Acceptance Test).
 *
 * 100 records → 90 unique businesses → 90 seeded_pending_qa stores
 * No manual intervention required.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach } from 'vitest';
import { OpenDataUrlAdapter } from '../adapters/OpenDataUrlAdapter.js';
import { runIngestion } from '../IngestionPipeline.js';
import { resetIngestionStoreForTests } from '../IngestionRepository.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'data',
  'businessIngestion',
  'fixtures',
  'sample-opendata-businesses.json',
);

function fixtureFetch(): typeof fetch {
  const body = readFileSync(FIXTURE_PATH, 'utf8');
  return async () =>
    ({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      text: async () => body,
    }) as Response;
}

describe('Business Ingestion acceptance', () => {
  beforeEach(async () => {
    process.env.BUSINESS_INGESTION_DIR = path.join(
      process.cwd(),
      'data',
      'businessIngestion',
      'test-runs',
      String(Date.now()),
    );
    await resetIngestionStoreForTests();
  });

  it('runs fetch → normalize → deduplicate → score → create seeds (100 → 90 unique → 90 seeded_pending_qa)', async () => {
    const adapter = new OpenDataUrlAdapter({
      url: 'https://example.com/fixtures/sample-opendata-businesses.json',
      recordsPath: 'records',
      fetchImpl: fixtureFetch(),
    });

    const result = await runIngestion(adapter, { persistSeeds: true, persistStores: false });

    expect(result.metrics.recordsFetched).toBe(100);
    expect(result.metrics.recordsNormalized).toBe(100);
    expect(result.metrics.duplicatesRemoved).toBe(10);
    expect(result.metrics.uniqueRecords).toBe(90);
    expect(result.seeds).toHaveLength(90);
    expect(result.drafts).toHaveLength(90);

    for (const seed of result.seeds) {
      expect(seed.verificationStatus).toBe('seeded_pending_qa');
      expect(seed.publicVisibility).toBe('limited');
      expect(seed.ownerUserId).toBeNull();
      expect(seed.normalized.businessName).toBeTruthy();
      expect(seed.qualityScore).toBeGreaterThanOrEqual(0);
      expect(seed.qualityScore).toBeLessThanOrEqual(100);
    }

    for (const draft of result.drafts) {
      expect(draft.owner).toBeNull();
      expect(draft.claimable).toBe(true);
      expect(draft.publicVisibility).toBe('limited');
      expect(draft.provenance).toBe('ingestion_seed');
      expect(draft.verificationStatus).toBe('seeded_pending_qa');
    }

    expect(result.metrics.seedsCreated).toBe(90);
    expect(result.metrics.businessStoresPersisted).toBe(0);
  });
});
