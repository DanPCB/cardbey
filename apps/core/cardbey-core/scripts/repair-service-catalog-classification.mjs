#!/usr/bin/env node
/**
 * Governed migration: reclassify service stores with product-shaped catalog records.
 * Usage: node scripts/repair-service-catalog-classification.mjs [--dry-run] [--limit N]
 */

import { inferLegacyItemKind, migrateLegacyCatalogRecord } from '../src/lib/commerce/inferLegacyItemKind.js';
import { resolveCommerceProfile } from '../src/lib/commerce/resolveCommerceProfile.js';
import { countCatalogItemsByKind } from '../src/lib/commerce/assertCatalogKindConsistency.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : null;

/**
 * @param {object} draftPreview
 * @param {object} draftInput
 */
function repairDraftCatalog(draftPreview, draftInput = {}) {
  const profile = resolveCommerceProfile({
    businessName: draftInput.businessName ?? draftPreview?.meta?.storeName,
    storeType: draftInput.businessType ?? draftPreview?.meta?.storeType,
    verticalSlug: draftInput.verticalSlug ?? draftPreview?.meta?.verticalSlug,
    location: draftInput.location,
    currencyCode: draftInput.currencyCode ?? draftPreview?.meta?.currencyCode,
  });

  const items = Array.isArray(draftPreview?.items)
    ? draftPreview.items
    : Array.isArray(draftPreview?.catalog?.products)
      ? draftPreview.catalog.products
      : [];

  let recordsConverted = 0;
  let pricesPreserved = 0;
  let pricesFlagged = 0;
  let imagesRetained = 0;
  let imagesMarkedForReplacement = 0;

  const converted = items.map((item) => {
    const beforeKind = inferLegacyItemKind(item, profile);
    const migrated = migrateLegacyCatalogRecord(item, {
      businessCommerceProfile: profile,
      businessName: draftInput.businessName,
      businessType: draftInput.businessType,
      verticalSlug: draftInput.verticalSlug,
      location: draftInput.location,
      currencyCode: profile.currencyCode,
    });
    const afterKind = migrated.itemKind ?? inferLegacyItemKind(migrated, profile);
    if (beforeKind !== afterKind) recordsConverted += 1;
    if (item.price != null && migrated.price != null) pricesPreserved += 1;
    if (item.price != null && migrated.price == null && migrated.priceMode === 'quote_required') pricesFlagged += 1;
    if (migrated.imageUrl) imagesRetained += 1;
    if (migrated.imageMatchStatus === 'rejected' || migrated.imageMatchStatus === 'missing') {
      imagesMarkedForReplacement += 1;
    }
    return migrated;
  });

  return {
    profile,
    items: converted,
    recordsConverted,
    pricesPreserved,
    pricesFlagged,
    imagesRetained,
    imagesMarkedForReplacement,
  };
}

async function main() {
  let storesScanned = 0;
  let serviceStoresDetected = 0;
  let recordsConverted = 0;
  let pricesPreserved = 0;
  let pricesFlagged = 0;
  let imagesRetained = 0;
  let imagesMarkedForReplacement = 0;

  try {
    const { getPrismaClient } = await import('../src/lib/prisma.js');
    const prisma = getPrismaClient();
    const drafts = await prisma.draftStore.findMany({
      where: { status: { not: 'deleted' } },
      select: { id: true, preview: true, input: true },
      take: limit && Number.isFinite(limit) ? limit : undefined,
    });

    for (const draft of drafts) {
      storesScanned += 1;
      const preview =
        draft.preview && typeof draft.preview === 'object' ? draft.preview : {};
      const input = draft.input && typeof draft.input === 'object' ? draft.input : {};
      const repair = repairDraftCatalog(preview, input);
      if (repair.profile.catalogKind === 'service') serviceStoresDetected += 1;
      recordsConverted += repair.recordsConverted;
      pricesPreserved += repair.pricesPreserved;
      pricesFlagged += repair.pricesFlagged;
      imagesRetained += repair.imagesRetained;
      imagesMarkedForReplacement += repair.imagesMarkedForReplacement;

      if (!dryRun && repair.recordsConverted > 0) {
        const counts = countCatalogItemsByKind(repair.items);
        await prisma.draftStore.update({
          where: { id: draft.id },
          data: {
            preview: {
              ...preview,
              items: repair.items,
              meta: {
                ...(preview.meta ?? {}),
                catalogKind: repair.profile.catalogKind,
                businessCommerceProfile: repair.profile,
                catalogCounts: counts,
                migrationProvenance: {
                  repairedAt: new Date().toISOString(),
                  command: 'repair-service-catalog-classification',
                },
              },
            },
          },
        });
      }
    }
  } catch (err) {
    console.warn('[repair-service-catalog] prisma unavailable — report only mode', err?.message);
  }

  const report = {
    dryRun,
    storesScanned,
    serviceStoresDetected,
    recordsConverted,
    pricesPreserved,
    pricesFlagged,
    imagesRetained,
    imagesMarkedForReplacement,
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
