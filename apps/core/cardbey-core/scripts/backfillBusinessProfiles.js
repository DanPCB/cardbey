#!/usr/bin/env node
/**
 * Backfill BusinessProfile for stores missing storefrontSettings.businessProfile.
 * Does not overwrite existing profiles (owner-edited / published BSL data).
 *
 * Usage:
 *   node scripts/backfillBusinessProfiles.js [--dry-run] [--storeId=...]
 */

import { getPrismaClient } from '../src/lib/prisma.js';
import {
  extractBusinessProfile,
  attachBusinessProfileToStorefrontSettings,
  loadOrCreateBusinessProfile,
} from '../src/lib/businessSemantic/index.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const storeIdArg = args.find((a) => a.startsWith('--storeId='));
const storeIdFilter = storeIdArg ? storeIdArg.split('=')[1] : null;

function parseSettings(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return { ...raw };
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

async function main() {
  const prisma = getPrismaClient();
  const where = {
    deletedAt: null,
    ...(storeIdFilter ? { id: storeIdFilter } : {}),
  };

  const stores = await prisma.business.findMany({
    where,
    select: {
      id: true,
      name: true,
      type: true,
      description: true,
      storefrontSettings: true,
      products: {
        where: { deletedAt: null },
        select: {
          id: true,
          name: true,
          itemType: true,
          type: true,
          serviceCatalog: true,
          bookingEnabled: true,
          primaryAction: true,
        },
        take: 50,
      },
    },
  });

  let scanned = 0;
  let backfilled = 0;
  let skipped = 0;

  for (const store of stores) {
    scanned += 1;
    const settings = parseSettings(store.storefrontSettings);
    const existing = extractBusinessProfile(settings);
    if (existing) {
      skipped += 1;
      continue;
    }

    const oldBusinessType = settings.businessType ?? store.type ?? null;
    const { profile, confidence } = loadOrCreateBusinessProfile(
      {
        id: store.id,
        name: store.name,
        type: store.type,
        description: store.description,
        products: store.products,
      },
      { items: store.products, forceReclassify: true },
    );

    const nextSettings = attachBusinessProfileToStorefrontSettings(settings, {
      ...profile,
      storeId: store.id,
    });

    console.log(
      '[BUSINESS_PROFILE_BACKFILL]',
      JSON.stringify({
        dryRun,
        storeId: store.id,
        storeName: store.name,
        oldBusinessType,
        resolvedBusinessType: profile.businessType,
        confidence,
      }),
    );

    if (!dryRun) {
      await prisma.business.update({
        where: { id: store.id },
        data: { storefrontSettings: nextSettings },
      });
    }
    backfilled += 1;
  }

  console.log(
    '[BACKFILL_BUSINESS_PROFILES_DONE]',
    JSON.stringify({ dryRun, scanned, backfilled, skipped }),
  );
}

main()
  .catch((err) => {
    console.error('[BACKFILL_BUSINESS_PROFILES_ERROR]', err);
    process.exit(1);
  })
  .finally(async () => {
    const prisma = getPrismaClient();
    await prisma.$disconnect();
  });
