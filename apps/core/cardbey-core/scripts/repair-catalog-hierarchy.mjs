#!/usr/bin/env node
/**
 * Repair flat draft catalogs by recomputing categories from item categoryPath / labels.
 *
 * Dry-run by default. Pass --apply to write (creates preview.meta.catalogHierarchyRevision).
 *
 * Usage:
 *   node scripts/repair-catalog-hierarchy.mjs --draft=<id>
 *   node scripts/repair-catalog-hierarchy.mjs --draft=<id> --apply
 */

import { PrismaClient } from '@prisma/client';
import { recomputeDraftCategoriesFromItems } from '../src/lib/draftCategoryUtils.js';

const prisma = new PrismaClient();
const draftArg = process.argv.find((a) => a.startsWith('--draft='));
const apply = process.argv.includes('--apply');
const draftId = draftArg ? draftArg.split('=')[1] : '';

if (!draftId) {
  console.error('Usage: node scripts/repair-catalog-hierarchy.mjs --draft=<id> [--apply]');
  process.exit(1);
}

async function main() {
  const draft = await prisma.draftStore.findUnique({ where: { id: draftId } });
  if (!draft) {
    console.error(`Draft not found: ${draftId}`);
    process.exit(1);
  }
  const preview = draft.preview && typeof draft.preview === 'object' ? { ...draft.preview } : {};
  const items = Array.isArray(preview.items) ? preview.items : [];
  const beforeCats = Array.isArray(preview.categories) ? preview.categories : [];
  const { categories, items: repairedItems } = recomputeDraftCategoriesFromItems(items);

  const proposal = {
    event: 'catalog_hierarchy_repair_proposed',
    draftStoreId: draftId,
    apply: false,
    before: {
      categoryCount: beforeCats.length,
      itemCount: items.length,
      categoryNames: beforeCats.map((c) => c?.name).filter(Boolean),
    },
    after: {
      categoryCount: categories.length,
      itemCount: repairedItems.length,
      categoryNames: categories.map((c) => c?.name).filter(Boolean),
      samplePaths: repairedItems
        .slice(0, 8)
        .map((it) => ({ name: it.name, categoryPath: it.categoryPath, categoryId: it.categoryId })),
    },
  };

  if (!apply) {
    console.log(JSON.stringify(proposal, null, 2));
    return;
  }

  const revision = {
    at: new Date().toISOString(),
    source: 'repair-catalog-hierarchy.mjs',
    beforeCategoryNames: proposal.before.categoryNames,
    afterCategoryNames: proposal.after.categoryNames,
  };
  const meta =
    preview.meta && typeof preview.meta === 'object' && !Array.isArray(preview.meta)
      ? { ...preview.meta }
      : {};
  meta.catalogHierarchyRevision = revision;

  const nextPreview = {
    ...preview,
    categories,
    items: repairedItems,
    meta,
  };

  await prisma.draftStore.update({
    where: { id: draftId },
    data: { preview: nextPreview },
  });

  console.log(
    JSON.stringify(
      { ...proposal, apply: true, event: 'catalog_hierarchy_repair_applied', revision },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
