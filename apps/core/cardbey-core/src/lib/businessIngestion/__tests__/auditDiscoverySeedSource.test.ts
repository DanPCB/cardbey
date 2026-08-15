/**
 * Ensures audit seed loader warns when forced to file backend.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(__dirname, '../../../../../../..');
const AUDIT_LIB = path.join(REPO_ROOT, 'scripts', 'lib', 'discovery-data-audit.ts');

describe('audit discovery seed source', () => {
  let tmpDir: string;
  let prevIngestionDir: string | undefined;
  let prevBackend: string | undefined;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-seeds-'));
    prevIngestionDir = process.env.BUSINESS_INGESTION_DIR;
    prevBackend = process.env.BUSINESS_SEEDS_BACKEND;
    process.env.BUSINESS_INGESTION_DIR = tmpDir;
    process.env.BUSINESS_SEEDS_BACKEND = 'file';
    await fs.writeFile(
      path.join(tmpDir, 'seeds.json'),
      JSON.stringify([
        {
          id: 'fixture-1',
          verificationStatus: 'seeded_pending_qa',
          batchId: 'MELBOURNE_BATCH0_20260617',
          normalized: {
            businessName: 'Fixture Cafe',
            sourceType: 'opendata',
            sourceReference: 'MELBOURNE_BATCH0_20260617',
            sourceRowId: '1',
            email: null,
            city: 'Melbourne',
          },
          claimable: false,
          ownerUserId: null,
          storeId: null,
          draftId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]),
      'utf8',
    );
  });

  afterEach(async () => {
    if (prevIngestionDir === undefined) delete process.env.BUSINESS_INGESTION_DIR;
    else process.env.BUSINESS_INGESTION_DIR = prevIngestionDir;
    if (prevBackend === undefined) delete process.env.BUSINESS_SEEDS_BACKEND;
    else process.env.BUSINESS_SEEDS_BACKEND = prevBackend;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('falls back to seeds.json with explicit WARN when DB backend unavailable', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const mod = await import(pathToFileURL(AUDIT_LIB).href);
    const { seeds, seedSource } = await mod.loadAuditSeeds();
    expect(seedSource).toBe('file');
    expect(seeds).toHaveLength(1);
    expect(seeds[0]?.id).toBe('fixture-1');
    const warned = warnSpy.mock.calls.some((args: unknown[]) =>
      String(args[0] ?? '').includes(
        '[WARN] audit:seeds — DB unavailable, falling back to seeds.json',
      ),
    );
    expect(warned).toBe(true);
    warnSpy.mockRestore();
  });
});
