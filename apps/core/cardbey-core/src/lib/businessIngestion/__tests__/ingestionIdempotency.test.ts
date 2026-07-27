/**
 * Idempotent ingestion — acceptance: two runs of same sample → 90 seeds, not 180.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach } from 'vitest';
import { OpenDataUrlAdapter } from '../adapters/OpenDataUrlAdapter.js';
import { runIngestion } from '../IngestionPipeline.js';
import { listSeedRecords, resetIngestionStoreForTests, saveSeedRecords } from '../IngestionRepository.js';
import { randomUUID } from 'node:crypto';

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

describe('Business Ingestion idempotency', () => {
  beforeEach(async () => {
    process.env.BUSINESS_INGESTION_DIR = path.join(
      process.cwd(),
      'data',
      'businessIngestion',
      'idempotent-test',
      String(Date.now()),
    );
    await resetIngestionStoreForTests();
  });

  it('second sample run does not duplicate pending QA seeds (90 → 90)', async () => {
    const adapter = new OpenDataUrlAdapter({
      url: 'https://example.com/fixtures/sample-opendata-businesses.json',
      recordsPath: 'records',
      fetchImpl: fixtureFetch(),
    });

    const first = await runIngestion(adapter, { persistSeeds: true, persistStores: false });
    expect(first.metrics.seedsCreated).toBe(90);
    expect(first.metrics.seedsSkippedExisting).toBe(0);

    const second = await runIngestion(adapter, { persistSeeds: true, persistStores: false });
    expect(second.metrics.seedsCreated).toBe(0);
    expect(second.metrics.seedsSkippedExisting).toBe(90);
    expect(second.metrics.seedsUpdated).toBe(0);
    expect(second.metrics.uniqueRecords).toBe(90);

    const stored = await listSeedRecords();
    expect(stored).toHaveLength(90);
    expect(stored.filter((s) => s.verificationStatus === 'seeded_pending_qa')).toHaveLength(90);
  });

  it('heals orphan duplicates left by a prior non-idempotent run', async () => {
    const adapter = new OpenDataUrlAdapter({
      url: 'https://example.com/fixtures/sample-opendata-businesses.json',
      recordsPath: 'records',
      fetchImpl: fixtureFetch(),
    });

    await runIngestion(adapter, { persistSeeds: true, persistStores: false });
    const canonical = await listSeedRecords();
    expect(canonical).toHaveLength(90);

    const orphans = canonical.map((s) => ({ ...s, id: randomUUID() }));
    await saveSeedRecords([...canonical, ...orphans]);
    expect((await listSeedRecords())).toHaveLength(180);

    const healed = await runIngestion(adapter, { persistSeeds: true, persistStores: false });
    expect(healed.metrics.seedsSkippedExisting).toBe(90);
    expect((await listSeedRecords())).toHaveLength(90);
  });
});
