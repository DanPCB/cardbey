#!/usr/bin/env node
/**
 * Runtime migration: infer service catalog fields for existing Product rows.
 * Safe — never deletes data; only fills serviceCatalog JSON when missing.
 *
 * Usage: node scripts/migrateServiceCatalog.js [--dry-run] [--storeId=...]
 */

import { getPrismaClient } from '../src/lib/prisma.js';
import { normalizeCatalogItem } from '../src/lib/catalog/catalogItemClassification.js';
import {
  normalizeServiceCatalogItem,
  toServiceCatalogJson,
} from '../src/lib/catalog/serviceCatalogNormalizer.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const storeIdArg = args.find((a) => a.startsWith('--storeId='));
const storeIdFilter = storeIdArg ? storeIdArg.split('=')[1] : null;

async function main() {
  const prisma = getPrismaClient();
  const where = {
    deletedAt: null,
    ...(storeIdFilter ? { businessId: storeIdFilter } : {}),
  };

  const products = await prisma.product.findMany({
    where,
    include: { business: { select: { id: true, name: true, type: true } } },
  });

  let scanned = 0;
  let upgraded = 0;

  for (const product of products) {
    scanned += 1;
    const hasCatalog =
      product.serviceCatalog != null &&
      typeof product.serviceCatalog === 'object' &&
      Object.keys(product.serviceCatalog).length > 0;
    if (hasCatalog) continue;

    const classified = normalizeCatalogItem(product, {
      businessType: product.business?.type,
      businessName: product.business?.name,
    });
    const serviceFields = normalizeServiceCatalogItem(
      { ...product, itemType: classified.itemType },
      {
        businessType: product.business?.type,
        businessName: product.business?.name,
        itemType: classified.itemType,
      },
    );
    const serviceCatalog = toServiceCatalogJson(serviceFields);
    if (!serviceCatalog) continue;

    const patch = {
      serviceCatalog,
      itemType: classified.itemType,
      bookingEnabled: classified.bookingEnabled,
      purchaseEnabled: classified.purchaseEnabled,
      primaryAction: classified.primaryAction,
      ...(serviceFields.serviceMode === 'quote_required'
        ? { price: null, ...(serviceFields.fromPrice != null ? {} : {}) }
        : {}),
    };

    if (serviceFields.serviceMode === 'quote_required' && serviceFields.fromPrice != null && product.price != null) {
      patch.price = null;
    }

    console.log(
      '[MIGRATE_SERVICE_CATALOG]',
      JSON.stringify({
        dryRun,
        productId: product.id,
        storeId: product.businessId,
        name: product.name,
        serviceMode: serviceFields.serviceMode,
        executionAction: serviceFields.executionAction,
      }),
    );

    if (!dryRun) {
      await prisma.product.update({
        where: { id: product.id },
        data: patch,
      });
    }
    upgraded += 1;
  }

  console.log(
    JSON.stringify({
      ok: true,
      dryRun,
      scanned,
      upgraded,
      storeIdFilter,
    }),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
