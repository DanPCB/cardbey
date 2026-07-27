#!/usr/bin/env node
/**
 * Phase 4 — Dry-run deletion plan (no mutations).
 *
 * Usage:
 *   pnpm cleanup:discovery:dry-run
 */

import {
  buildAuditReport,
  buildCleanupPlan,
  ensureCoreEnv,
  formatDryRunMarkdown,
  getCorePrisma,
  loadAuditContext,
  writeReportFile,
} from './lib/discovery-data-audit.ts';

async function main() {
  await ensureCoreEnv();
  const prisma = await getCorePrisma();

  try {
    const ctx = await loadAuditContext(prisma);
    const report = buildAuditReport(ctx);
    const plan = buildCleanupPlan(report);
    const md = formatDryRunMarkdown(plan);
    const file = await writeReportFile('DISCOVERY_CLEANUP_DRY_RUN', md);

    console.log(`Dry-run report written: ${file}`);
    console.log('');
    console.log(md);
    console.log('\nWould delete:');
    console.log(`  Stores: ${plan.storeIds.length}`);
    console.log(`  DraftStores: ${plan.draftIds.length}`);
    console.log(`  BusinessSeeds: ${plan.seedIds.length}`);
    console.log(`  BI Snapshots / SeedSuitcases: ${plan.seedIdsForSuitcaseRemoval.length}`);
    console.log(`  Enrichment Candidates: ${plan.enrichmentCandidateIds.length}`);
    console.log(`  Activation Records: ${plan.claimIds.length}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[cleanup-discovery-dry-run] failed:', err);
  process.exit(1);
});
