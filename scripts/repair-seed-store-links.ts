#!/usr/bin/env node
/**
 * Repair stale seed ↔ published store links (dry-run by default).
 *
 * Usage:
 *   pnpm repair:seed-store-links:dry-run
 *   SEED_STORE_LINK_REPAIR_CONFIRM=1 pnpm repair:seed-store-links -- --apply
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promises as fs } from 'node:fs';
import {
  formatSeedStoreLinkRepairReport,
  planSeedStoreLinkRepairs,
} from './lib/seed-store-link-repair.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const CORE_ROOT = path.join(REPO_ROOT, 'apps', 'core', 'cardbey-core');

const apply = process.argv.includes('--apply');
const confirm = process.env.SEED_STORE_LINK_REPAIR_CONFIRM === '1';

async function loadCoreModules() {
  const repoPath = path.join(CORE_ROOT, 'src', 'lib', 'businessIngestion', 'IngestionRepository.ts');
  const linkPath = path.join(CORE_ROOT, 'src', 'lib', 'businessIngestion', 'linkSeedAfterPublish.ts');
  const prismaPath = path.join(CORE_ROOT, 'src', 'lib', 'prisma.js');
  const [repo, link, prismaMod] = await Promise.all([
    import(pathToFileURL(repoPath).href),
    import(pathToFileURL(linkPath).href),
    import(pathToFileURL(prismaPath).href),
  ]);
  return { ...repo, ...link, ...prismaMod };
}

async function main() {
  if (apply && !confirm) {
    console.error('Refusing --apply without SEED_STORE_LINK_REPAIR_CONFIRM=1');
    process.exit(1);
  }

  const { listSeedRecords, linkSeedAfterPublish, getPrismaClient } = await loadCoreModules();
  const prisma = getPrismaClient();

  const [seeds, stores, drafts] = await Promise.all([
    listSeedRecords(),
    prisma.business.findMany({
      where: { isActive: true },
      select: { id: true, name: true, slug: true, publishedAt: true, userId: true },
    }),
    prisma.draftStore.findMany({
      where: { committedStoreId: { not: null } },
      select: { id: true, committedStoreId: true, ownerUserId: true },
      orderBy: { committedAt: 'desc' },
    }),
  ]);

  const draftIdByStoreId = new Map<string, string | null>();
  const ownerByStoreId = new Map<string, string>();
  for (const draft of drafts) {
    const storeId = draft.committedStoreId;
    if (!storeId || draftIdByStoreId.has(storeId)) continue;
    draftIdByStoreId.set(storeId, draft.id);
    if (draft.ownerUserId) ownerByStoreId.set(storeId, draft.ownerUserId);
  }

  const plan = planSeedStoreLinkRepairs({
    seeds,
    stores,
    draftIdByStoreId,
  });

  const report = formatSeedStoreLinkRepairReport(plan, apply);
  const reportDir = path.join(REPO_ROOT, 'docs', 'reports');
  await fs.mkdir(reportDir, { recursive: true });
  const reportPath = path.join(
    reportDir,
    apply ? 'SEED_STORE_LINK_REPAIR_APPLIED.md' : 'SEED_STORE_LINK_REPAIR_DRY_RUN.md',
  );
  await fs.writeFile(reportPath, report, 'utf8');

  console.log(report);
  console.log(`\nReport: ${reportPath}`);

  if (!apply) return;

  let linked = 0;
  let failed = 0;
  for (const candidate of plan.candidates) {
    const store = stores.find((s) => s.id === candidate.storeId);
    const publisherUserId = store?.userId ?? ownerByStoreId.get(candidate.storeId) ?? 'system-repair';
    const result = await linkSeedAfterPublish({
      draftInput: { ingestionSeedId: candidate.seedId },
      draftId: candidate.draftId ?? `repair-${candidate.seedId}`,
      storeId: candidate.storeId,
      publisherUserId,
      storefrontUrl: `/s/${candidate.storeSlug}`,
      businessName: candidate.storeName,
    });
    if (result.linked) linked += 1;
    else if (!result.ok) failed += 1;
    console.log(
      `[repair:seed-store-links] ${candidate.seedBusinessName}: ${result.message} (linked=${result.linked})`,
    );
  }

  console.log(`\nLinked: ${linked}, failed: ${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('[repair:seed-store-links] failed:', err);
  process.exit(1);
});
