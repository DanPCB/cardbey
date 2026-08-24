#!/usr/bin/env node
/**
 * Recover Braybrook Batch 001 candidates from authoritative backup DB / extract JSON.
 * Does not invent Đại Thắng. Does not touch Batch 0.
 *
 *   pnpm -C apps/core/cardbey-core exec tsx ../../../scripts/recover-braybrook-candidates.ts
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_ROOT = path.resolve(__dirname, '..', 'apps', 'core', 'cardbey-core');

async function main() {
  const mod = await import(
    pathToFileURL(
      path.join(CORE_ROOT, 'src/lib/businessCandidate/enrichment/inventoryRecovery.ts'),
    ).href
  );
  const { candidates, report } = await mod.recoverBraybrookCandidatesFromBackup({ dryRun: false });
  console.log(
    JSON.stringify(
      {
        recovered: report.candidateCount,
        batchIds: report.batchIds,
        targetDaiThangFound: report.targetDaiThangFound,
        synthetic: report.synthetic,
        candidateIds: report.candidateIds,
        seedIds: report.seedIds,
      },
      null,
      2,
    ),
  );
  console.log(`Recovered ${candidates.length} candidates. See docs/reports/INVENTORY_RECOVERY_BRAYBROOK_BATCH001.md`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
