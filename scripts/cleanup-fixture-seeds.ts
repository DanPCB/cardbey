#!/usr/bin/env node
/**
 * Remove fixture / sample discovery seeds from ingestion JSON storage.
 *
 * Usage:
 *   pnpm cleanup:fixture-seeds:dry-run
 *   FIXTURE_SEED_CLEANUP_CONFIRM=1 pnpm cleanup:fixture-seeds -- --apply
 *
 * SAFETY: Never deletes Melbourne Batch 0, claimed/verified/activated seeds,
 * stores, users, or Prisma runtime data.
 */

import path from 'node:path';
import {
  buildFixtureSeedCleanupPlan,
  executeFixtureSeedCleanup,
  formatFixtureSeedDryRunMarkdown,
  printFixtureSeedSummary,
} from './lib/fixture-seed-cleanup.ts';
import { ensureCoreEnv, reportsDir, writeReportFile } from './lib/discovery-data-audit.ts';

const apply = process.argv.includes('--apply');

async function main() {
  if (apply && process.env.FIXTURE_SEED_CLEANUP_CONFIRM !== '1') {
    console.error(
      '[cleanup-fixture-seeds] Refusing --apply without FIXTURE_SEED_CLEANUP_CONFIRM=1.\n' +
        'Review dry-run first, then:\n' +
        '  FIXTURE_SEED_CLEANUP_CONFIRM=1 pnpm cleanup:fixture-seeds -- --apply',
    );
    process.exit(1);
  }

  await ensureCoreEnv();
  const plan = await buildFixtureSeedCleanupPlan();

  if (!apply) {
    printFixtureSeedSummary(plan);
    const md = formatFixtureSeedDryRunMarkdown(plan);
    const file = await writeReportFile('FIXTURE_SEED_CLEANUP_DRY_RUN', md);
    console.log(`\nDry-run report written: ${file}`);
    console.log(
      '\nTo apply: FIXTURE_SEED_CLEANUP_CONFIRM=1 pnpm cleanup:fixture-seeds -- --apply',
    );
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rollbackPath = path.join(reportsDir(), `FIXTURE_SEED_CLEANUP_ROLLBACK_${stamp}.json`);

  console.log('Writing rollback report before deletion…');
  console.log(`  ${rollbackPath}`);
  await executeFixtureSeedCleanup(plan, { apply: true, rollbackPath });

  printFixtureSeedSummary(plan);
  console.log('\nFixture seed cleanup complete.');
  console.log(`  Seeds deleted: ${plan.deleteCount}`);
  console.log(`  Claims removed: ${plan.claimIds.length}`);
  console.log(`  Rollback artifact: ${rollbackPath}`);
}

main().catch((err) => {
  console.error('[cleanup-fixture-seeds] failed:', err);
  process.exit(1);
});
