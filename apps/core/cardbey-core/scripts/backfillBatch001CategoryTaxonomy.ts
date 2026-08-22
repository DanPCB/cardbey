/**
 * Targeted Batch 001 backfill — re-run taxonomy + description on PARTIAL enriched candidates.
 *
 * Usage:
 *   pnpm exec tsx scripts/backfillBatch001CategoryTaxonomy.ts
 *   pnpm exec tsx scripts/backfillBatch001CategoryTaxonomy.ts --dry-run
 *   pnpm exec tsx scripts/backfillBatch001CategoryTaxonomy.ts --batch-id MELBOURNE_BATCH001_REAL_LOCAL
 */

import 'dotenv/config';
import { isBatch001BatchId } from '../src/lib/businessCandidate/batch001Config.js';
import { listBusinessCandidatesByBatch, listBusinessCandidates } from '../src/lib/businessCandidate/candidateRepository.js';
import {
  isPartialEnrichedCandidate,
  reapplyTaxonomyAndDescriptionForCandidate,
} from '../src/lib/businessCandidate/enrichment/seedCategoryNormalization.js';

function parseArgs(argv: string[]) {
  const dryRun = argv.includes('--dry-run');
  const batchFlagIdx = argv.indexOf('--batch-id');
  const batchId =
    batchFlagIdx >= 0 && argv[batchFlagIdx + 1]
      ? String(argv[batchFlagIdx + 1]).trim()
      : 'MELBOURNE_BATCH001_REAL_LOCAL';
  return { dryRun, batchId };
}

async function main() {
  const { dryRun, batchId } = parseArgs(process.argv.slice(2));
  if (!isBatch001BatchId(batchId)) {
    throw new Error(`Refusing backfill for non-Batch001 batchId=${batchId}`);
  }

  let candidates = await listBusinessCandidatesByBatch(batchId);
  if (!candidates.length) {
    const all = await listBusinessCandidates();
    candidates = all.filter((c) => isBatch001BatchId(c.batchId));
  }

  const targets = candidates.filter(isPartialEnrichedCandidate);
  console.log(
    `[backfill-taxonomy] batch=${batchId} total=${candidates.length} partialTargets=${targets.length} dryRun=${dryRun}`,
  );

  let changed = 0;
  for (const candidate of targets) {
    const result = await reapplyTaxonomyAndDescriptionForCandidate({ candidate, dryRun });
    if (result.changed) {
      changed += 1;
      console.log(
        `[backfill-taxonomy] ${candidate.name ?? candidate.id}: ${result.previousCategory ?? 'NULL'} → ${result.nextCategory}${result.descriptionChanged ? ' (+description)' : ''}`,
      );
    }
  }

  console.log(`[backfill-taxonomy] done changed=${changed}/${targets.length}`);
}

main().catch((err) => {
  console.error('[backfill-taxonomy] failed:', err);
  process.exit(1);
});
