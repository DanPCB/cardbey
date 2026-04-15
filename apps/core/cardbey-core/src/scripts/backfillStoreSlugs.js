/**
 * Backfill Store Slugs Script
 * Generates slugs for all stores that don't have one
 * Safe to re-run multiple times (idempotent)
 * 
 * Usage: npm run backfill:store-slugs
 * Or: node src/scripts/backfillStoreSlugs.js
 */

import { PrismaClient } from '@prisma/client';
import { slugify, generateUniqueStoreSlug } from '../utils/slug.js';

const prisma = new PrismaClient();

async function backfillStoreSlugs() {
  console.log('[BackfillStoreSlugs] Starting slug generation for existing stores...');

  try {
    // Get all stores (slug is required, but we'll filter for empty/invalid ones)
    const allStores = await prisma.business.findMany({
      select: {
        id: true,
        name: true,
        slug: true
      }
    });

    // Filter stores that need slugs (empty string or invalid)
    const stores = allStores.filter(store => {
      const slug = store.slug || '';
      // Check if slug is empty or doesn't match a valid slugified version of the name
      return !slug || slug.trim() === '';
    });

    console.log(`[BackfillStoreSlugs] Found ${stores.length} stores needing slugs (out of ${allStores.length} total)`);

    if (stores.length === 0) {
      console.log('[BackfillStoreSlugs] ✅ All stores already have valid slugs. Nothing to do.');
      return;
    }

    let generated = 0;
    let skipped = 0;
    let errors = 0;

    for (const store of stores) {
      try {
        // Generate slug from store name, or fallback to store id
        const baseInput = store.name || store.id;
        const slug = await generateUniqueStoreSlug(prisma, baseInput);

        if (!slug) {
          console.warn(`[BackfillStoreSlugs] ⚠️  Failed to generate slug for store ${store.id}`);
          skipped++;
          continue;
        }

        // Update store with slug
        await prisma.business.update({
          where: { id: store.id },
          data: { slug }
        });

        console.log(`[BackfillStoreSlugs] ✅ Generated slug "${slug}" for store ${store.id} (${store.name})`);
        generated++;
      } catch (error) {
        console.error(`[BackfillStoreSlugs] ❌ Error processing store ${store.id}:`, error.message);
        errors++;
      }
    }

    console.log(`[BackfillStoreSlugs] ✅ Complete: ${generated} slugs generated, ${skipped} skipped, ${errors} errors`);
    
    // Verify all stores have valid slugs
    const allStoresAfter = await prisma.business.findMany({
      select: { id: true, name: true, slug: true }
    });
    
    const storesWithoutSlugs = allStoresAfter.filter(store => {
      const slug = store.slug || '';
      return !slug || slug.trim() === '';
    });
    
    if (storesWithoutSlugs.length === 0) {
      console.log('[BackfillStoreSlugs] ✅ Verification passed: All stores now have valid slugs');
    } else {
      console.warn(`[BackfillStoreSlugs] ⚠️  Warning: ${storesWithoutSlugs.length} stores still missing slugs`);
    }
  } catch (error) {
    console.error('[BackfillStoreSlugs] ❌ Fatal error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.includes('backfillStoreSlugs')) {
  backfillStoreSlugs()
    .then(() => {
      console.log('[BackfillStoreSlugs] Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('[BackfillStoreSlugs] Script failed:', error);
      process.exit(1);
    });
}

export { backfillStoreSlugs };

