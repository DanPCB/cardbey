#!/usr/bin/env node
/**
 * Dry-run audit: find draft catalogs that look flat (no real category structure).
 *
 * Usage (from apps/core/cardbey-core):
 *   node scripts/audit-flat-catalogs.mjs
 *   node scripts/audit-flat-catalogs.mjs --limit=50
 *
 * Does not modify data. Emits JSON report to stdout.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const limit = limitArg ? Math.max(1, Number(limitArg.split('=')[1]) || 100) : 100;

function isPlaceholderCategory(name) {
  const s = String(name ?? '').trim();
  return !s || /^general$/i.test(s) || /^other$/i.test(s) || /^menu$/i.test(s) || /^cat_\d+$/i.test(s);
}

function auditPreview(preview) {
  const items = Array.isArray(preview?.items) ? preview.items : [];
  const categories = Array.isArray(preview?.categories) ? preview.categories : [];
  const realCats = categories.filter((c) => !isPlaceholderCategory(c?.name));
  const withPath = items.filter((it) => Array.isArray(it?.categoryPath) && it.categoryPath.length > 0).length;
  const allGeneral =
    items.length > 0 &&
    items.every((it) => {
      const c = String(it?.category || it?.categoryName || '').trim();
      return !c || isPlaceholderCategory(c);
    });

  const flat =
    items.length > 0 &&
    (realCats.length <= 1 || allGeneral) &&
    !(realCats.length > 1);

  return {
    itemCount: items.length,
    categoryCount: categories.length,
    realCategoryCount: realCats.length,
    itemsWithCategoryPath: withPath,
    allGeneralOrPlaceholder: allGeneral,
    isFlatSuspect: flat,
    recoveryHints: {
      fromCategoryPath: withPath > 0,
      fromCategoryLabels: items.some((it) => {
        const c = String(it?.category || it?.categoryName || '').trim();
        return c && !isPlaceholderCategory(c);
      }),
      needsReExtract: withPath === 0 && allGeneral,
    },
  };
}

async function main() {
  const drafts = await prisma.draftStore.findMany({
    take: limit,
    orderBy: { updatedAt: 'desc' },
    select: { id: true, updatedAt: true, preview: true, input: true },
  });

  const findings = [];
  for (const d of drafts) {
    const preview = d.preview && typeof d.preview === 'object' ? d.preview : {};
    const input = d.input && typeof d.input === 'object' ? d.input : {};
    const audit = auditPreview(preview);
    if (!audit.isFlatSuspect && audit.itemCount === 0) continue;
    if (audit.isFlatSuspect) {
      findings.push({
        draftStoreId: d.id,
        storeName: preview.storeName ?? input.businessName ?? null,
        missionId: input.missionId ?? preview.missionId ?? null,
        updatedAt: d.updatedAt,
        ...audit,
      });
    }
  }

  const report = {
    event: 'catalog_flat_store_detected',
    scanned: drafts.length,
    flatSuspectCount: findings.length,
    findings,
  };
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
