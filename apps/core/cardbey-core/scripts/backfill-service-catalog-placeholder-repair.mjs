#!/usr/bin/env node
/**
 * Backfill: rename leaked service-catalog placeholders in food/retail/fashion Product rows.
 * Rebuilds PublishedArtifactProjection for affected stores.
 *
 * Usage (from apps/core/cardbey-core):
 *   node scripts/backfill-service-catalog-placeholder-repair.mjs --dry-run
 *   node scripts/backfill-service-catalog-placeholder-repair.mjs --apply
 *   node scripts/backfill-service-catalog-placeholder-repair.mjs --apply --slug=c-shunshine
 */

import '../src/env/ensureDatabaseUrl.js';
import { PrismaClient } from '../src/lib/prismaClient.js';
import { normalizeProductName } from '../src/lib/catalog/productCatalogService.js';
import {
  isServiceCatalogPlaceholderName,
  repairServiceCatalogPlaceholderProductsForDb,
} from '../src/lib/catalog/serviceCatalogPlaceholders.js';
import { buildPublishedBusinessArtifact } from '../src/services/publishedArtifactProjection/buildPublishedBusinessArtifact.js';
import {
  hasPublishedArtifactProjectionTable,
  persistPublishedBusinessArtifact,
} from '../src/services/publishedArtifactProjection/persistPublishedBusinessArtifact.js';

const dryRun = !process.argv.includes('--apply');
const slugArg = process.argv.find((a) => a.startsWith('--slug='));
const slugFilter = slugArg ? slugArg.split('=')[1]?.toLowerCase().trim() : null;
const skipProjections = process.argv.includes('--skip-projections');

const prisma = new PrismaClient();

function patchTranslations(translations, fromName, toName, toDescription) {
  if (!translations || typeof translations !== 'object' || Array.isArray(translations)) {
    return translations;
  }
  const next = { ...translations };
  for (const [lang, entry] of Object.entries(next)) {
    if (!entry || typeof entry !== 'object') continue;
    const langEntry = { ...entry };
    if (isServiceCatalogPlaceholderName(langEntry.name) || langEntry.name === fromName) {
      langEntry.name = toName;
    }
    if (toDescription && isServiceCatalogPlaceholderName(entry.description)) {
      langEntry.description = toDescription;
    }
    next[lang] = langEntry;
  }
  return next;
}

async function rebuildProjection(business) {
  const projection = buildPublishedBusinessArtifact({
    business,
    source: 'service_catalog_placeholder_backfill',
  });
  await persistPublishedBusinessArtifact(prisma, projection, {
    sourceDraftId: null,
    publishRunId: `svc-placeholder-backfill-${Date.now()}`,
  });
}

async function main() {
  console.log('[backfill-service-catalog-placeholder-repair]', {
    dryRun,
    slugFilter,
    skipProjections,
    database: process.env.DATABASE_URL?.slice(0, 32) ?? '(unset)',
  });

  const businesses = await prisma.business.findMany({
    where: {
      ...(slugFilter ? { slug: slugFilter } : {}),
      isActive: true,
    },
    select: {
      id: true,
      slug: true,
      name: true,
      type: true,
      catalogLabel: true,
      products: {
        where: { deletedAt: null },
        orderBy: { name: 'asc' },
      },
    },
    orderBy: { slug: 'asc' },
  });

  let storesScanned = 0;
  let storesRepaired = 0;
  let productsRepaired = 0;
  let projectionsRebuilt = 0;
  const projectionTableReady = hasPublishedArtifactProjectionTable(prisma);

  for (const business of businesses) {
    storesScanned += 1;
    const profile = {
      businessName: business.name,
      storeName: business.name,
      businessType: business.type,
      storeType: business.type,
      catalogLabel: business.catalogLabel,
    };

    const repair = repairServiceCatalogPlaceholderProductsForDb(
      business.products,
      profile,
      normalizeProductName,
    );
    if (!repair.repaired) continue;

    storesRepaired += 1;
    productsRepaired += repair.repairedCount;
    console.log(
      JSON.stringify({
        slug: business.slug,
        businessId: business.id,
        repairedCount: repair.repairedCount,
        repairs: repair.repairs,
      }),
    );

    if (dryRun) continue;

    const repairedById = new Map(repair.products.map((p) => [p.id, p]));
    for (const row of repair.repairs) {
      const next = repairedById.get(row.id);
      if (!next) continue;
      const original = business.products.find((p) => p.id === row.id);
      await prisma.product.update({
        where: { id: row.id },
        data: {
          name: next.name,
          normalizedName: normalizeProductName(next.name),
          description: next.description ?? original?.description ?? null,
          itemType: null,
          bookingEnabled: null,
          purchaseEnabled: null,
          primaryAction: null,
          serviceCatalog: null,
          translations: patchTranslations(
            original?.translations,
            row.fromName,
            row.toName,
            next.description,
          ),
          updatedAt: new Date(),
        },
      });
    }

    if (!skipProjections && projectionTableReady) {
      const refreshed = await prisma.business.findUnique({
        where: { id: business.id },
        include: {
          products: { where: { isPublished: true }, orderBy: { name: 'asc' }, take: 200 },
        },
      });
      if (refreshed) {
        await rebuildProjection(refreshed);
        projectionsRebuilt += 1;
      }
    }
  }

  console.log('[backfill-service-catalog-placeholder-repair] done', {
    storesScanned,
    storesRepaired,
    productsRepaired,
    projectionsRebuilt,
    dryRun,
  });

  if (dryRun && storesRepaired > 0) {
    console.log('Re-run with --apply to persist repairs.');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
