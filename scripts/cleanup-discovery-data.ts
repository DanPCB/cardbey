#!/usr/bin/env node
/**
 * Phase 3 + 5 — Tag test metadata and optionally execute cleanup.
 *
 * Usage:
 *   pnpm cleanup:discovery -- --tag-only
 *   pnpm cleanup:discovery -- --apply
 *
 * SAFETY: --apply performs destructive deletes. Requires prior audit review.
 * Rollback JSON is written to docs/reports/ before any mutation.
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import {
  REPO_ROOT,
  buildAuditReport,
  buildCleanupPlan,
  ensureCoreEnv,
  executeCleanupPlan,
  formatDryRunMarkdown,
  getCorePrisma,
  loadAuditContext,
  reportsDir,
  tagTestRecords,
} from './lib/discovery-data-audit.ts';

const apply = process.argv.includes('--apply');
const tagOnly = process.argv.includes('--tag-only');

async function main() {
  if (apply && !process.env.DISCOVERY_CLEANUP_CONFIRM) {
    console.error(
      '[cleanup-discovery-data] Refusing --apply without DISCOVERY_CLEANUP_CONFIRM=1.\n' +
        'Review audit + dry-run reports first, then:\n' +
        '  DISCOVERY_CLEANUP_CONFIRM=1 pnpm cleanup:discovery -- --apply',
    );
    process.exit(1);
  }

  await ensureCoreEnv();
  const prisma = await getCorePrisma();

  try {
    const ctx = await loadAuditContext(prisma);
    const report = buildAuditReport(ctx);
    const plan = buildCleanupPlan(report);

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rollbackPath = path.join(reportsDir(), `DISCOVERY_CLEANUP_ROLLBACK_${stamp}.json`);

    if (tagOnly || apply) {
      const tagging = await tagTestRecords(report);
      console.log('TEST DATA TAGGING COMPLETE');
      console.log(`  Stores tagged: ${tagging.storesTagged}`);
      console.log(`  Seeds tagged: ${tagging.seedsTagged}`);
      console.log(`  Snapshots tagged: ${tagging.snapshotsTagged}`);
    }

    if (!apply) {
      const md = formatDryRunMarkdown(plan);
      console.log('\nDry-run only (no deletions). Plan preview:\n');
      console.log(md);
      if (!tagOnly) {
        console.log(
          '\nTo tag test metadata: pnpm cleanup:discovery -- --tag-only\n' +
            'To execute cleanup after review: DISCOVERY_CLEANUP_CONFIRM=1 pnpm cleanup:discovery -- --apply',
        );
      }
      return;
    }

    console.log(`\nWriting rollback report: ${rollbackPath}`);
    await executeCleanupPlan(prisma, plan, { apply: true, rollbackPath });
    console.log('Cleanup complete.');
    console.log(`  Stores deleted: ${plan.storeIds.length}`);
    console.log(`  Drafts deleted: ${plan.draftIds.length}`);
    console.log(`  Seeds deleted: ${plan.seedIds.length}`);
    console.log(`  Rollback artifact: ${rollbackPath}`);

    const readinessTemplate = path.join(REPO_ROOT, 'docs', 'MELBOURNE_BATCH0_READINESS.md');
    await fs.appendFile(
      readinessTemplate,
      `\n\n---\n\nCleanup executed: ${new Date().toISOString()}\nRollback: \`${path.basename(rollbackPath)}\`\n`,
      'utf8',
    ).catch(() => undefined);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[cleanup-discovery-data] failed:', err);
  process.exit(1);
});
