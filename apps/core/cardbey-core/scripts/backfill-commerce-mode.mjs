#!/usr/bin/env node
/**
 * Backfill Business.transactionMode + storefront commerce from business.type.
 * Usage: node scripts/backfill-commerce-mode.mjs [--dry-run] [--slug=my-nails]
 */

import { PrismaClient } from '@prisma/client';
import { resolveStoreCommerce } from '../src/lib/storeTransactionMode.js';

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');
const slugArg = process.argv.find((a) => a.startsWith('--slug='));
const slugFilter = slugArg ? slugArg.split('=')[1] : null;

async function main() {
  const businesses = await prisma.business.findMany({
    where: slugFilter ? { slug: slugFilter } : {},
    select: {
      id: true,
      slug: true,
      name: true,
      type: true,
      transactionMode: true,
      catalogLabel: true,
      ctaLabel: true,
      storefrontSettings: true,
    },
  });

  const changes = [];

  for (const b of businesses) {
    const commerce = resolveStoreCommerce({ storeType: b.type, businessType: b.type });
    const existingSf =
      b.storefrontSettings && typeof b.storefrontSettings === 'object'
        ? b.storefrontSettings
        : {};
    const next = {
      transactionMode: commerce.transactionMode,
      catalogLabel: commerce.catalogLabel,
      ctaLabel: commerce.ctaLabel,
      commerceMode: commerce.commerceMode,
      ctaAction: commerce.ctaAction,
    };
    const changed =
      b.transactionMode !== next.transactionMode ||
      b.catalogLabel !== next.catalogLabel ||
      b.ctaLabel !== next.ctaLabel ||
      existingSf.commerceMode !== next.commerceMode;

    if (changed) {
      changes.push({
        id: b.id,
        slug: b.slug,
        name: b.name,
        type: b.type,
        from: {
          transactionMode: b.transactionMode,
          catalogLabel: b.catalogLabel,
          ctaLabel: b.ctaLabel,
          commerceMode: existingSf.commerceMode ?? null,
        },
        to: next,
      });
    }
  }

  console.log(`[backfill-commerce-mode] scanned=${businesses.length} changed=${changes.length} dryRun=${dryRun}`);
  for (const row of changes) {
    console.log(JSON.stringify(row));
  }

  if (!dryRun && changes.length > 0) {
    for (const row of changes) {
      const b = businesses.find((x) => x.id === row.id);
      const existingSf =
        b?.storefrontSettings && typeof b.storefrontSettings === 'object' ? b.storefrontSettings : {};
      await prisma.business.update({
        where: { id: row.id },
        data: {
          transactionMode: row.to.transactionMode,
          catalogLabel: row.to.catalogLabel,
          ctaLabel: row.to.ctaLabel,
          storefrontSettings: {
            ...existingSf,
            commerceMode: row.to.commerceMode,
            cta: {
              ...(existingSf.cta && typeof existingSf.cta === 'object' ? existingSf.cta : {}),
              label: row.to.ctaLabel,
              action: row.to.ctaAction,
            },
          },
          updatedAt: new Date(),
        },
      });
    }
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
