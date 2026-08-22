/**
 * Export durable Postgres business_seed rows → data/businessCandidates/candidates.json
 *
 * Usage (Render shell or local with DATABASE_URL=postgresql://...):
 *   pnpm exec tsx scripts/exportPostgresSeedsToCandidates.ts --dry-run
 *   pnpm exec tsx scripts/exportPostgresSeedsToCandidates.ts
 *   pnpm exec tsx scripts/exportPostgresSeedsToCandidates.ts --all-seeds
 *
 * Then enrich + taxonomy backfill:
 *   pnpm enrich:candidates -- --batchId=MELBOURNE_BATCH001_REAL_LOCAL
 *   pnpm exec tsx scripts/backfillBatch001CategoryTaxonomy.ts
 *
 * Commit data/businessCandidates/candidates.json before deploy so inventory survives pod recycle.
 */

import 'dotenv/config';
import { exportPostgresSeedsToCandidates } from '../src/lib/businessCandidate/exportSeedsToCandidates.js';
import { MELBOURNE_BATCH001_REAL_LOCAL_ID } from '../src/lib/businessCandidate/batch001Config.js';

function readArg(name: string): string | null {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  if (hit) return hit.slice(prefix.length).trim() || null;
  return null;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const batchIdArg = readArg('batch-id');
  const includeAllSeeds = process.argv.includes('--all-seeds') || !batchIdArg;
  const batchId = batchIdArg ?? MELBOURNE_BATCH001_REAL_LOCAL_ID;

  const { candidates, result } = await exportPostgresSeedsToCandidates({
    dryRun,
    batchId: includeAllSeeds ? null : batchId,
    includeAllSeeds,
  });

  console.log(
    JSON.stringify(
      {
        ...result,
        sample: candidates.slice(0, 3).map((c) => ({
          id: c.id,
          name: c.name,
          seedId: c.seedId,
          status: c.status,
          batchId: c.batchId,
        })),
      },
      null,
      2,
    ),
  );

  if (dryRun) {
    console.log('[export-seeds] dry-run only — no writes to candidates.json');
  } else {
    console.log(`[export-seeds] wrote ${result.exported} candidates to BUSINESS_CANDIDATE_DIR/candidates.json`);
  }
}

main().catch((err) => {
  console.error('[export-seeds] failed:', err);
  process.exit(1);
});
