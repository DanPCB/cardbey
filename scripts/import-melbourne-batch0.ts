#!/usr/bin/env node
/**
 * Melbourne Batch 0 pilot importer — BusinessSeeds only.
 *
 * Usage (from repo root):
 *   pnpm import:melbourne-batch0
 *   pnpm import:melbourne-batch0 -- --dry-run
 *
 * Rules:
 * - persistStores: false (no DraftStore / Business rows)
 * - verificationStatus: seeded_pending_qa
 * - batchId / campaignId: MELBOURNE_BATCH0_20260617
 * - No activation, no Runtime Authority bypass
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promises as fs } from 'node:fs';

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
  pilotName?: string;
  region?: string;
  records: unknown[];
}

async function loadCoreModules() {
  const indexPath = path.join(CORE_ROOT, 'src', 'lib', 'businessIngestion', 'index.ts');
  return import(pathToFileURL(indexPath).href);
}

function formatImportReport(params: {
  manifest: PilotManifest;
  metrics: {
    recordsFetched: number;
    seedsCreated: number;
    seedsUpdated: number;
    seedsSkippedExisting: number;
    businessStoresPersisted: number;
  };
  seeds: Array<{
    id: string;
    businessName: string | null;
    verificationStatus: string;
    storeId: string | null;
    draftId: string | null;
    batchId: string | null;
    campaignId: string | null;
  }>;
  dryRun: boolean;
}): string {
  const { manifest, metrics, seeds, dryRun: isDry } = params;
  const now = new Date().toISOString();

  return `# Melbourne Batch 0 Import Report

Generated: ${now}  
Pilot: ${manifest.pilotName ?? manifest.batchId}  
Batch ID: \`${manifest.batchId}\`  
Campaign ID: \`${manifest.campaignId}\`  
Mode: ${isDry ? '**DRY RUN** (no writes)' : '**IMPORTED**'}

---

## Import summary

| Metric | Value |
|--------|------:|
| Records in pilot file | ${manifest.records.length} |
| Records fetched | ${metrics.recordsFetched} |
| Seeds created | ${metrics.seedsCreated} |
| Seeds updated | ${metrics.seedsUpdated} |
| Seeds skipped (unchanged) | ${metrics.seedsSkippedExisting} |
| Business stores persisted | ${metrics.businessStoresPersisted} |

---

## Acceptance checks

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| Discovery seeds | 10 | ${seeds.length} | ${seeds.length === 10 ? 'PASS' : 'REVIEW'} |
| All \`seeded_pending_qa\` | 10 | ${seeds.filter((s) => s.verificationStatus === 'seeded_pending_qa').length} | ${seeds.every((s) => s.verificationStatus === 'seeded_pending_qa') ? 'PASS' : 'REVIEW'} |
| No stores created | 0 | ${seeds.filter((s) => s.storeId).length} | ${seeds.every((s) => !s.storeId) ? 'PASS' : 'FAIL'} |
| No drafts created | 0 | ${seeds.filter((s) => s.draftId).length} | ${seeds.every((s) => !s.draftId) ? 'PASS' : 'FAIL'} |
| batchId tagged | all | ${seeds.filter((s) => s.batchId === manifest.batchId).length}/${seeds.length} | ${seeds.every((s) => s.batchId === manifest.batchId) ? 'PASS' : 'REVIEW'} |

---

## Post-QA targets (not at import time)

| Stage | Target after QA approve |
|-------|------------------------:|
| Claimable | 10 |
| BI Snapshots | 10 |
| Seed Suitcases | 10 |

BI snapshots and suitcases are generated when seeds are QA-approved via the governed promotion path — not during seed import.

---

## Imported seeds

${seeds
  .map(
    (s) =>
      `- **${s.businessName ?? s.id}** — \`${s.id}\` — ${s.verificationStatus} — store:${s.storeId ?? 'none'}`,
  )
  .join('\n')}

---

## Runtime Authority

- No \`persistStores\`
- No activation
- No direct Prisma Business / DraftStore writes
- Seeds only via Business Ingestion pipeline
`;
}

async function main() {
  const raw = readFileSync(pilotFile, 'utf8');
  const manifest = JSON.parse(raw) as PilotManifest;

  if (!manifest.batchId || !manifest.campaignId || !Array.isArray(manifest.records)) {
    throw new Error('Invalid pilot manifest: requires batchId, campaignId, records[]');
  }

  if (manifest.records.length !== 10) {
    console.warn(`[import-melbourne-batch0] Expected 10 records, found ${manifest.records.length}`);
  }

  const mod = await loadCoreModules();
  const { OpenDataUrlAdapter, runIngestion } = mod;

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

  if (dryRun) {
    const result = await runIngestion(adapter, {
      persistSeeds: false,
      persistStores: false,
      batchId: manifest.batchId,
      campaignId: manifest.campaignId,
    });

    const seedRows = result.seeds.map((s) => ({
      id: s.id,
      businessName: s.normalized.businessName,
      verificationStatus: s.verificationStatus,
      storeId: s.storeId,
      draftId: s.draftId,
      batchId: s.batchId ?? null,
      campaignId: s.campaignId ?? null,
    }));

    const report = formatImportReport({
      manifest,
      metrics: {
        recordsFetched: result.metrics.recordsFetched,
        seedsCreated: result.seeds.length,
        seedsUpdated: 0,
        seedsSkippedExisting: 0,
        businessStoresPersisted: 0,
      },
      seeds: seedRows,
      dryRun: true,
    });

    const reportDir = path.join(REPO_ROOT, 'docs', 'reports');
    await fs.mkdir(reportDir, { recursive: true });
    const reportPath = path.join(reportDir, 'MELBOURNE_BATCH0_IMPORT.md');
    await fs.writeFile(reportPath, report, 'utf8');

    console.log(report);
    console.log(`\nDry-run report: ${reportPath}`);
    return;
  }

  const result = await runIngestion(adapter, {
    persistSeeds: true,
    persistStores: false,
    batchId: manifest.batchId,
    campaignId: manifest.campaignId,
  });

  const seedRows = result.seeds.map((s) => ({
    id: s.id,
    businessName: s.normalized.businessName,
    verificationStatus: s.verificationStatus,
    storeId: s.storeId,
    draftId: s.draftId,
    batchId: s.batchId ?? null,
    campaignId: s.campaignId ?? null,
  }));

  const report = formatImportReport({
    manifest,
    metrics: {
      recordsFetched: result.metrics.recordsFetched,
      seedsCreated: result.metrics.seedsCreated,
      seedsUpdated: result.metrics.seedsUpdated,
      seedsSkippedExisting: result.metrics.seedsSkippedExisting,
      businessStoresPersisted: result.metrics.businessStoresPersisted,
    },
    seeds: seedRows,
    dryRun: false,
  });

  const reportDir = path.join(REPO_ROOT, 'docs', 'reports');
  await fs.mkdir(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, 'MELBOURNE_BATCH0_IMPORT.md');
  await fs.writeFile(reportPath, report, 'utf8');

  console.log(report);
  console.log(`\nImport report: ${reportPath}`);
  console.log('\nNext: QA approve seeds in Control Center → Review Pending QA');
}

main().catch((err) => {
  console.error('[import-melbourne-batch0] failed:', err);
  process.exit(1);
});
