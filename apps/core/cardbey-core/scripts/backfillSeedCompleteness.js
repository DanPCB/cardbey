#!/usr/bin/env node
/**
 * Backfill completeness for seeded_pending_qa records.
 * Usage: node --import tsx/esm scripts/backfillSeedCompleteness.js
 *    or: npm run backfill:seed-completeness
 */

import { listSeedRecords } from '../src/lib/businessIngestion/IngestionRepository.js';
import { persistSeedCompleteness } from '../src/lib/ingestion/persistSeedCompleteness.js';

const pending = (await listSeedRecords()).filter((s) => s.verificationStatus === 'seeded_pending_qa');
console.log(`[backfillSeedCompleteness] pending_qa=${pending.length}`);

let ok = 0;
let failed = 0;
for (const seed of pending) {
  try {
    const result = await persistSeedCompleteness(seed.id);
    if (result.ok) {
      ok += 1;
      console.log(
        `  ${seed.id} ${seed.normalized?.businessName ?? ''} tier=${result.completeness.tier} blockers=${result.completeness.blockers.join(',') || 'none'}`,
      );
    } else {
      failed += 1;
      console.warn(`  ${seed.id} FAIL ${result.message}`);
    }
  } catch (err) {
    failed += 1;
    console.warn(`  ${seed.id} ERROR ${err?.message ?? err}`);
  }
}

console.log(`[backfillSeedCompleteness] done ok=${ok} failed=${failed}`);
process.exit(failed ? 1 : 0);
