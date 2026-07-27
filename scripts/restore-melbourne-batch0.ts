#!/usr/bin/env node
/**
 * Idempotent Melbourne Batch 0 restore — seeds only, no stores/drafts.
 *
 * Usage (from repo root):
 *   pnpm restore:melbourne-batch0
 *   pnpm restore:melbourne-batch0 -- --dry-run
 *
 * Rules:
 * - Import missing MELBOURNE_BATCH0_20260617 seeds only
 * - Never duplicate existing business names in the batch
 * - Preserve claimable / verified / activated governance on existing seeds
 * - Report before/after counts
 */

import { readFileSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  MELBOURNE_BATCH0_ID,
  buildMelbourneBatchRestoreMetrics,
  captureGovernanceSnapshot,
  formatMelbourneBatchRestoreReport,
  reconcileMelbourneBatchRestore,
  validateGovernancePreserved,
  validateMelbourneBatchRestoreAcceptance,
  type MelbourneBatchRestoreReport,
} from './lib/melbourne-batch0-restore.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const CORE_ROOT = path.join(REPO_ROOT, 'apps', 'core', 'cardbey-core');
const DEFAULT_PILOT_FILE = path.join(
  CORE_ROOT,
  'data',
  'businessIngestion',
  'pilots',
  'MELBOURNE_BATCH0_20260617.json',
);

const dryRun = process.argv.includes('--dry-run');
const pilotFile = process.argv.find((a) => a.endsWith('.json')) ?? DEFAULT_PILOT_FILE;

interface PilotManifest {
  batchId: string;
  campaignId: string;
  records: unknown[];
}

async function loadCoreModules() {
  const indexPath = path.join(CORE_ROOT, 'src', 'lib', 'businessIngestion', 'index.ts');
  const seedIdempotencyPath = path.join(
    CORE_ROOT,
    'src',
    'lib',
    'businessIngestion',
    'seedIdempotency.ts',
  );
  const repoPath = path.join(CORE_ROOT, 'src', 'lib', 'businessIngestion', 'IngestionRepository.ts');
  const [ingestion, idempotency, repo] = await Promise.all([
    import(pathToFileURL(indexPath).href),
    import(pathToFileURL(seedIdempotencyPath).href),
    import(pathToFileURL(repoPath).href),
  ]);
  return { ...ingestion, ...idempotency, ...repo };
}

function factualDigest(seed: {
  normalized: Record<string, unknown>;
  qualityScore: number;
  qualityTier: string;
  resolution: string;
}): string {
  const n = seed.normalized;
  return JSON.stringify({
    businessName: n.businessName,
    legalName: n.legalName,
    address: n.address,
    phone: n.phone,
    website: n.website,
    category: n.category,
    registrationNumber: n.registrationNumber,
    email: n.email,
    operatingRegion: n.operatingRegion,
    country: n.country,
    state: n.state,
    city: n.city,
    qualityScore: seed.qualityScore,
    qualityTier: seed.qualityTier,
    resolution: seed.resolution,
    sourceType: n.sourceType,
    sourceReference: n.sourceReference,
    sourceRowId: n.sourceRowId,
  });
}

async function main() {
  const raw = readFileSync(pilotFile, 'utf8');
  const manifest = JSON.parse(raw) as PilotManifest;

  if (!manifest.batchId || !manifest.campaignId || !Array.isArray(manifest.records)) {
    throw new Error('Invalid pilot manifest: requires batchId, campaignId, records[]');
  }

  const mod = await loadCoreModules();
  const {
    OpenDataUrlAdapter,
    ingestionPipeline,
    listSeedRecords,
    saveSeedRecords,
    buildSourceKey,
    reconcileIngestionSeeds,
    findExistingSeed,
    indexExistingSeeds,
    mergeIncomingSeed,
  } = mod;

  const beforeSeeds = await listSeedRecords();
  const before = buildMelbourneBatchRestoreMetrics(beforeSeeds);
  const governanceBefore = captureGovernanceSnapshot(beforeSeeds);

  const adapter = new OpenDataUrlAdapter({
    url: `file://${pilotFile.replace(/\\/g, '/')}`,
    sourceReference: manifest.batchId,
    recordsPath: 'records',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      text: async () => raw,
    }),
  });

  const pipelineResult = await ingestionPipeline.run(adapter, {
    persistSeeds: false,
    persistStores: false,
    batchId: manifest.batchId,
    campaignId: manifest.campaignId,
  });

  const reconciled = reconcileMelbourneBatchRestore(
    pipelineResult.seeds,
    beforeSeeds,
    {
      reconcileIngestionSeeds,
      findExistingSeed,
      indexExistingSeeds,
      mergeIncomingSeed,
      factualDigest,
    },
  );

  if (!dryRun) {
    const byId = new Map(beforeSeeds.map((s) => [s.id, s]));
    for (const seed of reconciled.seeds) {
      byId.set(seed.id, seed);
    }

    const canonicalIds = new Set(reconciled.seeds.map((s) => s.id));
    const canonicalSourceKeys = new Set(reconciled.seeds.map((s) => buildSourceKey(s.normalized)));
    const compacted = [...byId.values()].filter((seed) => {
      const sk = buildSourceKey(seed.normalized);
      if (canonicalSourceKeys.has(sk) && !canonicalIds.has(seed.id)) {
        return false;
      }
      return true;
    });

    await saveSeedRecords(compacted);
  }

  const afterSeeds = dryRun
    ? (() => {
        const byId = new Map(beforeSeeds.map((s) => [s.id, s]));
        for (const seed of reconciled.seeds) byId.set(seed.id, seed);
        const canonicalIds = new Set(reconciled.seeds.map((s) => s.id));
        const canonicalSourceKeys = new Set(
          reconciled.seeds.map((s) => buildSourceKey(s.normalized)),
        );
        return [...byId.values()].filter((seed) => {
          const sk = buildSourceKey(seed.normalized);
          if (canonicalSourceKeys.has(sk) && !canonicalIds.has(seed.id)) return false;
          return true;
        });
      })()
    : await listSeedRecords();

  const after = buildMelbourneBatchRestoreMetrics(afterSeeds);
  const governance = validateGovernancePreserved(governanceBefore, afterSeeds);
  const acceptance = validateMelbourneBatchRestoreAcceptance(after);

  const report: MelbourneBatchRestoreReport = {
    batchId: manifest.batchId,
    before,
    after,
    seedsCreated: reconciled.seedsCreated,
    seedsUpdated: reconciled.seedsUpdated,
    seedsSkippedExisting: reconciled.seedsSkippedExisting,
    governancePreserved: governance.ok,
    preservedRows: governance.rows,
    acceptance,
  };

  const markdown = formatMelbourneBatchRestoreReport(report);
  const reportDir = path.join(REPO_ROOT, 'docs', 'reports');
  await fs.mkdir(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, 'MELBOURNE_BATCH0_RESTORE.md');
  await fs.writeFile(reportPath, markdown, 'utf8');

  console.log(markdown);
  console.log(`\n${dryRun ? 'Dry-run' : 'Restore'} report: ${reportPath}`);

  const overallOk = acceptance.ok && governance.ok;
  if (!overallOk) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[restore-melbourne-batch0] failed:', err);
  process.exit(1);
});
