#!/usr/bin/env node
/**
 * Phase 10.5 — Backfill historical content into suitcase vault (idempotent).
 *
 * Usage (from apps/core/cardbey-core):
 *   node scripts/backfill-suitcase-items.mjs                  # dry-run (default)
 *   node scripts/backfill-suitcase-items.mjs --apply          # write rows
 *   node scripts/backfill-suitcase-items.mjs --apply --owner=user-id
 *   node scripts/backfill-suitcase-items.mjs --limit=200
 */
import '../src/env/ensureDatabaseUrl.js';
import { getPrismaClient } from '../src/lib/prisma.js';
import { runSuitcaseBackfill } from '../src/services/suitcase/suitcaseBackfill.js';

const apply = process.argv.includes('--apply');
const dryRun = !apply;
const ownerArg = process.argv.find((a) => a.startsWith('--owner='));
const ownerId = ownerArg ? ownerArg.slice('--owner='.length).trim() : null;
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.slice('--limit='.length)) : undefined;

async function main() {
  const prisma = getPrismaClient();

  console.log('[SUITCASE_BACKFILL] start', {
    mode: dryRun ? 'dry_run' : 'apply',
    ownerId: ownerId ?? '(all owners)',
    limit: limit ?? 500,
    database: String(process.env.DATABASE_URL ?? '').replace(/:[^:@/]+@/, ':***@').slice(0, 80),
  });

  const report = await runSuitcaseBackfill(prisma, { dryRun, ownerId, limit });

  if (report.error) {
    console.error('[SUITCASE_BACKFILL] aborted:', report.error);
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log('\n[SUITCASE_BACKFILL] report');
  console.log(JSON.stringify(report, null, 2));

  const totals = {
    created: report.created ?? 0,
    skipped: report.skipped ?? 0,
    failed: report.failed ?? 0,
    wouldCreate: report.wouldCreate ?? 0,
  };

  console.log('\n[SUITCASE_BACKFILL] totals', totals);

  if (dryRun) {
    console.log('\nDry-run complete. Re-run with --apply to persist changes.');
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('[SUITCASE_BACKFILL] fatal', err);
  process.exit(1);
});
