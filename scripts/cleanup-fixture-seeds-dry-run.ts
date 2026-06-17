#!/usr/bin/env node
/**
 * Dry-run fixture / sample discovery seed cleanup (no mutations).
 *
 * Usage:
 *   pnpm cleanup:fixture-seeds:dry-run
 */

import {
  buildFixtureSeedCleanupPlan,
  formatFixtureSeedDryRunMarkdown,
  printFixtureSeedSummary,
} from './lib/fixture-seed-cleanup.ts';
import { ensureCoreEnv, writeReportFile } from './lib/discovery-data-audit.ts';

async function main() {
  await ensureCoreEnv();
  const plan = await buildFixtureSeedCleanupPlan();
  const md = formatFixtureSeedDryRunMarkdown(plan);
  const file = await writeReportFile('FIXTURE_SEED_CLEANUP_DRY_RUN', md);

  printFixtureSeedSummary(plan);
  console.log(`\nDry-run report written: ${file}`);
  console.log('\nTo apply after review:');
  console.log('  FIXTURE_SEED_CLEANUP_CONFIRM=1 pnpm cleanup:fixture-seeds -- --apply');
}

main().catch((err) => {
  console.error('[cleanup-fixture-seeds-dry-run] failed:', err);
  process.exit(1);
});
