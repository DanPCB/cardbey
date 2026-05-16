/**
 * Backfill MIEntity for existing Signage Assets and Playlist Items
 * 
 * This script creates MIEntity records for:
 * 1. SignageAssets that don't have an associated MIEntity
 * 2. PlaylistItems in SIGNAGE playlists that don't have an associated MIEntity
 * 
 * Safe to re-run multiple times (idempotent - skips existing records)
 * 
 * Usage: 
 *   npm run backfill:mi-signage
 *   Or: node scripts/backfillMIForSignage.js
 */

import { PrismaClient } from '@prisma/client';
import { registerOrUpdateEntity } from '../src/services/miService.js';
import {
  buildScreenItemMIBrain,
  inferMediaType,
  buildDimensions,
  inferOrientation,
} from '../src/mi/miDeviceHelpers.js';

console.log('[BackfillMI] Script starting...');
const prisma = new PrismaClient();

// Verify MIEntity model is available
if (!prisma.mIEntity) {
  console.error('[BackfillMI] ❌ ERROR: prisma.mIEntity is not available!');
  console.error('[BackfillMI] This usually means Prisma client needs to be regenerated.');
  console.error('[BackfillMI] Run: npx prisma generate');
  process.exit(1);
}
console.log('[BackfillMI] ✅ Prisma client initialized, mIEntity model available');

/**
 * Build a minimal MIBrain for a generic signage asset
 */
function buildGenericAssetMIBrain(asset, context) {
  return {
    role: 'creative_source',
    primaryIntent: 'general_asset_library',
    secondaryIntents: [],
    context: {
      tenantId: context.tenantId || undefined,
      storeId: context.storeId || undefined,
      channels: ['asset_library'],
      environmentHints: {
        isPhysical: false,
        isOnDeviceEngine: false,
      },
    },
    capabilities: {
      personalisation: { enabled: false },
      localisation: { autoTranslate: false, fallbackLocale: 'en-AU' },
      channelAdaptation: { enabled: true },
      dynamicLayout: { enabled: false },
      dataBindings: { enabled: false },
    },
    behaviorRules: {},
    ctaPlan: null,
    analyticsPlan: {
      kpis: ['asset_views', 'asset_downloads'],
      attributionSource: 'asset_library',
    },
    lifecycle: {
      status: 'active',
    },
  };
}

/**
 * Backfill MIEntity for SignageAssets
 */
async function backfillSignageAssets() {
  console.log('[BackfillMI] Starting backfill for SignageAssets...');

  try {
    // Find all SignageAssets that don't have an associated MIEntity
    const assets = await prisma.signageAsset.findMany({
      where: {
        // We'll check for MIEntity existence in the loop
      },
      orderBy: { createdAt: 'desc' },
    });

    console.log(`[BackfillMI] Found ${assets.length} SignageAssets to check`);

    if (assets.length === 0) {
      console.log('[BackfillMI] ✅ No SignageAssets found. Nothing to do.');
      return { processed: 0, created: 0, skipped: 0, errors: 0 };
    }

    const { getEntityByLink } = await import('../src/services/miService.js');
    let processed = 0;
    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const asset of assets) {
      try {
        // Check if MIEntity already exists for this asset
        // Use Prisma directly to check existence (more reliable)
        const existing = await prisma.mIEntity.findUnique({
          where: { creativeAssetId: asset.id },
        });
        if (existing) {
          skipped++;
          continue;
        }

        // Infer media type - helper expects { type, mimeType? }
        const mediaType = inferMediaType({
          type: asset.type,
          mimeType: null,
        });

        // Build dimensions - helper expects { width?, height? }
        const dimensions = buildDimensions({
          width: null,
          height: null,
        });

        // Build context
        const context = {
          tenantId: asset.tenantId || null,
          storeId: asset.storeId || null,
        };

        // Build MIBrain
        const miBrain = buildGenericAssetMIBrain(asset, context);

        // Register MIEntity
        await registerOrUpdateEntity({
          productId: asset.id,
          productType: 'poster', // SignageAssets are typically posters/images
          mediaType,
          fileUrl: asset.url || '',
          previewUrl: asset.url || '',
          dimensions: dimensions || undefined,
          orientation: undefined,
          durationSec: asset.durationS || null,
          createdByUserId: asset.tenantId || 'system',
          createdByEngine: 'creative_engine_v3',
          sourceProjectId: null,
          tenantId: asset.tenantId || null,
          storeId: asset.storeId || null,
          campaignId: null,
          miBrain,
          status: 'active',
          links: {
            creativeAssetId: asset.id,
          },
        });

        created++;
        processed++;

        if (processed % 10 === 0) {
          console.log(`[BackfillMI] Processed ${processed}/${assets.length} assets...`);
        }
      } catch (err) {
        errors++;
        console.error(`[BackfillMI] Error processing asset ${asset.id}:`, err.message);
      }
    }

    console.log(`[BackfillMI] ✅ SignageAssets: ${created} created, ${skipped} skipped, ${errors} errors`);
    return { processed, created, skipped, errors };
  } catch (err) {
    console.error('[BackfillMI] Fatal error in backfillSignageAssets:', err);
    throw err;
  }
}

/**
 * Backfill MIEntity for PlaylistItems in SIGNAGE playlists
 */
async function backfillPlaylistItems() {
  console.log('[BackfillMI] Starting backfill for PlaylistItems...');

  try {
    // Find all SIGNAGE playlists with items
    const playlists = await prisma.playlist.findMany({
      where: {
        type: 'SIGNAGE',
      },
      include: {
        items: {
          where: {
            assetId: { not: null }, // Only items with assets
          },
          include: {
            asset: true, // Include SignageAsset
          },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    console.log(`[BackfillMI] Found ${playlists.length} SIGNAGE playlists`);

    let totalItems = 0;
    for (const playlist of playlists) {
      totalItems += playlist.items.length;
    }

    console.log(`[BackfillMI] Found ${totalItems} playlist items to check`);

    if (totalItems === 0) {
      console.log('[BackfillMI] ✅ No playlist items found. Nothing to do.');
      return { processed: 0, created: 0, skipped: 0, errors: 0 };
    }

    const { getEntityByLink } = await import('../src/services/miService.js');
    let processed = 0;
    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const playlist of playlists) {
      for (const item of playlist.items) {
        try {
          // Check if MIEntity already exists for this playlist item
          // Use Prisma directly to check existence (more reliable)
          const existing = await prisma.mIEntity.findUnique({
            where: { screenItemId: item.id },
          });
          if (existing) {
            skipped++;
            continue;
          }

          if (!item.asset) {
            skipped++;
            continue; // Skip items without assets
          }

          const asset = item.asset;

          // Build context
          const context = {
            tenantId: playlist.tenantId || null,
            storeId: playlist.storeId || null,
            campaignId: null,
            userId: null,
            screenOrientation: undefined,
          };

          // Use helper functions to build MI data
          const mediaType = inferMediaType({
            type: asset.type,
            mimeType: null,
          });
          const dimensions = buildDimensions({
            width: null,
            height: null,
          });
          const orientation = inferOrientation(
            {
              width: null,
              height: null,
            },
            context
          );

          // Build file URL
          const fileUrl = asset.url || '';
          const previewUrl = fileUrl;

          // Build MIBrain using helper
          const miBrain = buildScreenItemMIBrain(
            {
              id: item.id,
              durationS: item.durationS || 8,
            },
            {
              id: asset.id,
              type: asset.type,
              url: asset.url,
              durationS: asset.durationS || null,
              width: null,
              height: null,
              mimeType: null,
            },
            context
          );

          // Register or update MIEntity
          await registerOrUpdateEntity({
            productId: item.id,
            productType: 'screen_item',
            mediaType,
            fileUrl,
            previewUrl,
            dimensions: dimensions || undefined,
            orientation: orientation || undefined,
            durationSec: item.durationS || asset.durationS || null,
            createdByUserId: playlist.tenantId || 'system',
            createdByEngine: 'device_engine_v2',
            sourceProjectId: null,
            tenantId: playlist.tenantId || null,
            storeId: playlist.storeId || null,
            campaignId: null,
            miBrain,
            status: 'active',
            links: {
              screenItemId: item.id,
            },
          });

          created++;
          processed++;

          if (processed % 10 === 0) {
            console.log(`[BackfillMI] Processed ${processed}/${totalItems} playlist items...`);
          }
        } catch (err) {
          errors++;
          console.error(`[BackfillMI] Error processing playlist item ${item.id}:`, err.message);
        }
      }
    }

    console.log(`[BackfillMI] ✅ PlaylistItems: ${created} created, ${skipped} skipped, ${errors} errors`);
    return { processed, created, skipped, errors };
  } catch (err) {
    console.error('[BackfillMI] Fatal error in backfillPlaylistItems:', err);
    throw err;
  }
}

/**
 * Main backfill function
 */
async function main() {
  // Force output to stderr to ensure it's visible
  console.error('[BackfillMI] ============================================');
  console.error('[BackfillMI] Starting MIEntity backfill for Signage');
  console.error('[BackfillMI] ============================================');
  console.log('[BackfillMI] ============================================');
  console.log('[BackfillMI] Starting MIEntity backfill for Signage');
  console.log('[BackfillMI] ============================================');

  try {
    // Backfill SignageAssets
    const assetResults = await backfillSignageAssets();

    // Backfill PlaylistItems
    const itemResults = await backfillPlaylistItems();

    // Summary
    console.log('[BackfillMI] ============================================');
    console.log('[BackfillMI] Backfill Summary:');
    console.log('[BackfillMI] ============================================');
    console.log('[BackfillMI] SignageAssets:');
    console.log(`[BackfillMI]   - Processed: ${assetResults.processed}`);
    console.log(`[BackfillMI]   - Created: ${assetResults.created}`);
    console.log(`[BackfillMI]   - Skipped: ${assetResults.skipped}`);
    console.log(`[BackfillMI]   - Errors: ${assetResults.errors}`);
    console.log('[BackfillMI] PlaylistItems:');
    console.log(`[BackfillMI]   - Processed: ${itemResults.processed}`);
    console.log(`[BackfillMI]   - Created: ${itemResults.created}`);
    console.log(`[BackfillMI]   - Skipped: ${itemResults.skipped}`);
    console.log(`[BackfillMI]   - Errors: ${itemResults.errors}`);
    console.log('[BackfillMI] ============================================');
    console.log('[BackfillMI] ✅ Backfill complete!');
  } catch (err) {
    console.error('[BackfillMI] ❌ Backfill failed:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Always run main() when script is executed directly
(async () => {
  try {
    console.log('[BackfillMI] Script loaded, calling main()...');
    await main();
    console.log('[BackfillMI] Script completed successfully');
    process.exit(0);
  } catch (err) {
    console.error('[BackfillMI] Fatal error:', err);
    console.error('[BackfillMI] Stack:', err.stack);
    process.exit(1);
  }
})();

export { main as backfillMIForSignage };
