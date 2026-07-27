#!/usr/bin/env node
/**
 * Backfill business_ingestion_run table from data/businessIngestion/runs.json
 *
 * Usage:
 *   pnpm backfill:business-ingestion-runs [--dry-run]
 */
import 'dotenv/config';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { backfillIngestionRun } from '../src/lib/businessIngestion/BusinessIngestionRunRepository.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_ROOT = path.resolve(__dirname, '..');
const dryRun = process.argv.includes('--dry-run');

const runsPath =
  process.env.BUSINESS_INGESTION_DIR != null
    ? path.join(process.env.BUSINESS_INGESTION_DIR, 'runs.json')
    : path.join(CORE_ROOT, 'data', 'businessIngestion', 'runs.json');

async function main() {
  let raw: string;
  try {
    raw = await fs.readFile(runsPath, 'utf8');
  } catch (err) {
    console.error(`[backfill-business-ingestion-runs] cannot read ${runsPath}:`, err);
    process.exit(1);
  }

  const runs = JSON.parse(raw);
  if (!Array.isArray(runs)) {
    console.error('[backfill-business-ingestion-runs] runs.json must be an array');
    process.exit(1);
  }

  const stats = { inserted: 0, updated: 0, skipped: 0, errors: 0 };

  if (dryRun) {
    console.log(
      `[backfill-business-ingestion-runs] dry-run: would process ${runs.length} runs from ${runsPath}`,
    );
    return;
  }

  process.env.BUSINESS_INGESTION_RUNS_BACKEND = 'db';
  process.env.BUSINESS_SEEDS_BACKEND = 'db';

  for (const run of runs) {
    if (!run?.runId) {
      stats.errors++;
      continue;
    }
    try {
      const result = await backfillIngestionRun(run);
      stats[result]++;
    } catch (err) {
      stats.errors++;
      console.warn('[backfill-business-ingestion-runs] failed for', run.runId, err);
    }
  }

  console.log('[backfill-business-ingestion-runs] complete', { runsPath, ...stats });
}

main().catch((err) => {
  console.error('[backfill-business-ingestion-runs] fatal:', err);
  process.exit(1);
});
