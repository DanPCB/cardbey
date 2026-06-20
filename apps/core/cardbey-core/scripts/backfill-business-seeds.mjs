#!/usr/bin/env node
/**
 * Backfill business_seed table from data/businessIngestion/seeds.json
 *
 * Usage:
 *   pnpm exec tsx scripts/backfill-business-seeds.mjs [--dry-run]
 *   node --import ../../../node_modules/tsx/dist/loader.mjs scripts/backfill-business-seeds.mjs
 */
import 'dotenv/config';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dbBackfillSeed } from '../src/lib/businessIngestion/businessSeedDbRepository.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_ROOT = path.resolve(__dirname, '..');
const dryRun = process.argv.includes('--dry-run');

const seedsPath =
  process.env.BUSINESS_INGESTION_DIR != null
    ? path.join(process.env.BUSINESS_INGESTION_DIR, 'seeds.json')
    : path.join(CORE_ROOT, 'data', 'businessIngestion', 'seeds.json');

async function main() {
  let raw: string;
  try {
    raw = await fs.readFile(seedsPath, 'utf8');
  } catch (err) {
    console.error(`[backfill-business-seeds] cannot read ${seedsPath}:`, err);
    process.exit(1);
  }

  const seeds = JSON.parse(raw);
  if (!Array.isArray(seeds)) {
    console.error('[backfill-business-seeds] seeds.json must be an array');
    process.exit(1);
  }

  const stats = { inserted: 0, updated: 0, skipped: 0, errors: 0 };

  if (dryRun) {
    console.log(`[backfill-business-seeds] dry-run: would process ${seeds.length} seeds from ${seedsPath}`);
    return;
  }

  process.env.BUSINESS_SEEDS_BACKEND = 'db';

  for (const seed of seeds) {
    if (!seed?.id || !seed?.normalized) {
      stats.errors++;
      continue;
    }
    try {
      const result = await dbBackfillSeed(seed);
      stats[result]++;
    } catch (err) {
      stats.errors++;
      console.warn('[backfill-business-seeds] failed for', seed.id, err);
    }
  }

  console.log('[backfill-business-seeds] complete', { seedsPath, ...stats });
}

main().catch((err) => {
  console.error('[backfill-business-seeds] fatal:', err);
  process.exit(1);
});
