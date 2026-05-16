/**
 * Fix Media Base URL Migration Script
 * Updates media URLs that point to old IP addresses (192.168.1.12:3001, 192.168.1.9:3001)
 * to the current base URL (http://192.168.1.3:3001)
 * 
 * Usage:
 *   npm run fix:media-base-url
 * 
 * Set DRY_RUN = false to perform actual updates
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// DRY_RUN mode - set to false to perform actual updates
const DRY_RUN = true;

// Old base URLs to replace
const OLD_BASE_URLS = [
  'http://192.168.1.12:3001',
  'http://192.168.1.9:3001',
  'http://192.168.1.12:3001/',
  'http://192.168.1.9:3001/',
];

// New base URL
const NEW_BASE_URL = 'http://192.168.1.3:3001';

/**
 * Replace old base URL with new base URL in a URL string
 */
function replaceBaseUrl(url, oldBase, newBase) {
  // Normalize oldBase (remove trailing slash for matching)
  const normalizedOldBase = oldBase.replace(/\/$/, '');
  
  // Check if URL starts with old base
  if (url.startsWith(normalizedOldBase)) {
    // Replace old base with new base
    return url.replace(normalizedOldBase, newBase);
  }
  
  return url;
}

/**
 * Fix URLs in Media model
 */
async function fixMediaUrls() {
  console.log('🔍 Scanning Media model for old base URLs...\n');

  // Build OR conditions for all old base URLs
  // Prisma doesn't support OR with different fields easily, so we'll query each separately
  const allMedia = [];
  
  for (const oldBase of OLD_BASE_URLS) {
    const normalizedOldBase = oldBase.replace(/\/$/, '');
    
    // Find media with old base in url field
    const mediaWithOldUrl = await prisma.media.findMany({
      where: {
        url: { startsWith: normalizedOldBase },
      },
      select: {
        id: true,
        url: true,
        optimizedUrl: true,
      },
    });
    allMedia.push(...mediaWithOldUrl);
    
    // Find media with old base in optimizedUrl field
    const mediaWithOldOptimizedUrl = await prisma.media.findMany({
      where: {
        optimizedUrl: { startsWith: normalizedOldBase },
      },
      select: {
        id: true,
        url: true,
        optimizedUrl: true,
      },
    });
    allMedia.push(...mediaWithOldOptimizedUrl);
  }

  // Remove duplicates by id
  const uniqueMedia = Array.from(
    new Map(allMedia.map(m => [m.id, m])).values()
  );

  console.log(`📊 Found ${uniqueMedia.length} Media records with old base URLs\n`);

  let updatedCount = 0;
  let skippedCount = 0;

  for (const media of uniqueMedia) {
    let needsUpdate = false;
    const updateData = {};

    // Check and fix url field
    for (const oldBase of OLD_BASE_URLS) {
      if (media.url && media.url.startsWith(oldBase.replace(/\/$/, ''))) {
        const newUrl = replaceBaseUrl(media.url, oldBase, NEW_BASE_URL);
        if (newUrl !== media.url) {
          updateData.url = newUrl;
          needsUpdate = true;
          console.log(`  📝 Media ${media.id}:`);
          console.log(`     Old URL: ${media.url}`);
          console.log(`     New URL: ${newUrl}`);
          break; // Found match, no need to check other old bases
        }
      }
    }

    // Check and fix optimizedUrl field
    if (media.optimizedUrl) {
      for (const oldBase of OLD_BASE_URLS) {
        if (media.optimizedUrl.startsWith(oldBase.replace(/\/$/, ''))) {
          const newOptimizedUrl = replaceBaseUrl(media.optimizedUrl, oldBase, NEW_BASE_URL);
          if (newOptimizedUrl !== media.optimizedUrl) {
            updateData.optimizedUrl = newOptimizedUrl;
            needsUpdate = true;
            if (Object.keys(updateData).length === 1) {
              // Only log header if this is the first field being updated
              console.log(`  📝 Media ${media.id}:`);
            }
            console.log(`     Old Optimized URL: ${media.optimizedUrl}`);
            console.log(`     New Optimized URL: ${newOptimizedUrl}`);
            break; // Found match, no need to check other old bases
          }
        }
      }
    }

    if (needsUpdate) {
      if (DRY_RUN) {
        console.log(`     ⚠️  [DRY RUN] Would update Media ${media.id}`);
        updatedCount++; // Count as "would update" in dry run
      } else {
        try {
          await prisma.media.update({
            where: { id: media.id },
            data: updateData,
          });
          console.log(`     ✅ Updated Media ${media.id}`);
          updatedCount++;
        } catch (error) {
          console.error(`     ❌ Error updating Media ${media.id}:`, error.message);
          skippedCount++;
        }
      }
      console.log('');
    } else {
      skippedCount++;
    }
  }

  return { total: uniqueMedia.length, updated: updatedCount, skipped: skippedCount };
}

/**
 * Fix URLs in SignageAsset model
 */
async function fixSignageAssetUrls() {
  console.log('🔍 Scanning SignageAsset model for old base URLs...\n');

  // Query all signage assets with old base URLs
  const allAssets = [];
  
  for (const oldBase of OLD_BASE_URLS) {
    const normalizedOldBase = oldBase.replace(/\/$/, '');
    
    const assets = await prisma.signageAsset.findMany({
      where: {
        url: { startsWith: normalizedOldBase },
      },
      select: {
        id: true,
        url: true,
      },
    });
    allAssets.push(...assets);
  }

  // Remove duplicates by id
  const uniqueAssets = Array.from(
    new Map(allAssets.map(a => [a.id, a])).values()
  );

  console.log(`📊 Found ${uniqueAssets.length} SignageAsset records with old base URLs\n`);

  let updatedCount = 0;
  let skippedCount = 0;

  for (const asset of uniqueAssets) {
    let needsUpdate = false;
    const updateData = {};

    // Check and fix url field
    for (const oldBase of OLD_BASE_URLS) {
      if (asset.url && asset.url.startsWith(oldBase.replace(/\/$/, ''))) {
        const newUrl = replaceBaseUrl(asset.url, oldBase, NEW_BASE_URL);
        if (newUrl !== asset.url) {
          updateData.url = newUrl;
          needsUpdate = true;
          console.log(`  📝 SignageAsset ${asset.id}:`);
          console.log(`     Old URL: ${asset.url}`);
          console.log(`     New URL: ${newUrl}`);
          break; // Found match, no need to check other old bases
        }
      }
    }

    if (needsUpdate) {
      if (DRY_RUN) {
        console.log(`     ⚠️  [DRY RUN] Would update SignageAsset ${asset.id}`);
        updatedCount++; // Count as "would update" in dry run
      } else {
        try {
          await prisma.signageAsset.update({
            where: { id: asset.id },
            data: updateData,
          });
          console.log(`     ✅ Updated SignageAsset ${asset.id}`);
          updatedCount++;
        } catch (error) {
          console.error(`     ❌ Error updating SignageAsset ${asset.id}:`, error.message);
          skippedCount++;
        }
      }
      console.log('');
    } else {
      skippedCount++;
    }
  }

  return { total: uniqueAssets.length, updated: updatedCount, skipped: skippedCount };
}

/**
 * Fix URLs in MIEntity model
 */
async function fixMIEntityUrls() {
  console.log('🔍 Scanning MIEntity model for old base URLs...\n');

  // Query all MI entities with old base URLs
  const allEntities = [];
  
  for (const oldBase of OLD_BASE_URLS) {
    const normalizedOldBase = oldBase.replace(/\/$/, '');
    
    // Find entities with old base in fileUrl field
    const entitiesWithOldFileUrl = await prisma.mIEntity.findMany({
      where: {
        fileUrl: { startsWith: normalizedOldBase },
      },
      select: {
        id: true,
        fileUrl: true,
        previewUrl: true,
      },
    });
    allEntities.push(...entitiesWithOldFileUrl);
    
    // Find entities with old base in previewUrl field
    const entitiesWithOldPreviewUrl = await prisma.mIEntity.findMany({
      where: {
        previewUrl: { startsWith: normalizedOldBase },
      },
      select: {
        id: true,
        fileUrl: true,
        previewUrl: true,
      },
    });
    allEntities.push(...entitiesWithOldPreviewUrl);
  }

  // Remove duplicates by id
  const uniqueEntities = Array.from(
    new Map(allEntities.map(e => [e.id, e])).values()
  );

  console.log(`📊 Found ${uniqueEntities.length} MIEntity records with old base URLs\n`);

  let updatedCount = 0;
  let skippedCount = 0;

  for (const entity of uniqueEntities) {
    let needsUpdate = false;
    const updateData = {};

    // Check and fix fileUrl field
    if (entity.fileUrl) {
      for (const oldBase of OLD_BASE_URLS) {
        if (entity.fileUrl.startsWith(oldBase.replace(/\/$/, ''))) {
          const newFileUrl = replaceBaseUrl(entity.fileUrl, oldBase, NEW_BASE_URL);
          if (newFileUrl !== entity.fileUrl) {
            updateData.fileUrl = newFileUrl;
            needsUpdate = true;
            if (!needsUpdate || Object.keys(updateData).length === 1) {
              // Only log once per entity
              console.log(`  📝 MIEntity ${entity.id}:`);
            }
            console.log(`     Old fileUrl: ${entity.fileUrl}`);
            console.log(`     New fileUrl: ${newFileUrl}`);
            break; // Found match, no need to check other old bases
          }
        }
      }
    }

    // Check and fix previewUrl field
    if (entity.previewUrl) {
      for (const oldBase of OLD_BASE_URLS) {
        if (entity.previewUrl.startsWith(oldBase.replace(/\/$/, ''))) {
          const newPreviewUrl = replaceBaseUrl(entity.previewUrl, oldBase, NEW_BASE_URL);
          if (newPreviewUrl !== entity.previewUrl) {
            updateData.previewUrl = newPreviewUrl;
            needsUpdate = true;
            if (Object.keys(updateData).length === 1) {
              // Only log header if this is the first field being updated
              console.log(`  📝 MIEntity ${entity.id}:`);
            }
            console.log(`     Old previewUrl: ${entity.previewUrl}`);
            console.log(`     New previewUrl: ${newPreviewUrl}`);
            break; // Found match, no need to check other old bases
          }
        }
      }
    }

    if (needsUpdate) {
      if (DRY_RUN) {
        console.log(`     ⚠️  [DRY RUN] Would update MIEntity ${entity.id}`);
        updatedCount++; // Count as "would update" in dry run
      } else {
        try {
          await prisma.mIEntity.update({
            where: { id: entity.id },
            data: updateData,
          });
          console.log(`     ✅ Updated MIEntity ${entity.id}`);
          updatedCount++;
        } catch (error) {
          console.error(`     ❌ Error updating MIEntity ${entity.id}:`, error.message);
          skippedCount++;
        }
      }
      console.log('');
    } else {
      skippedCount++;
    }
  }

  return { total: uniqueEntities.length, updated: updatedCount, skipped: skippedCount };
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Starting Media Base URL Migration\n');
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (no changes will be made)' : '✏️  LIVE MODE (updates will be performed)'}\n`);
  console.log(`Old Base URLs: ${OLD_BASE_URLS.join(', ')}`);
  console.log(`New Base URL: ${NEW_BASE_URL}\n`);
  console.log('='.repeat(60) + '\n');

  try {
    // Fix Media model
    const mediaStats = await fixMediaUrls();
    console.log('='.repeat(60) + '\n');

    // Fix SignageAsset model
    const signageStats = await fixSignageAssetUrls();
    console.log('='.repeat(60) + '\n');

    // Fix MIEntity model
    const miEntityStats = await fixMIEntityUrls();
    console.log('='.repeat(60) + '\n');

    // Summary
    console.log('📊 Summary:\n');
    console.log(`Media:`);
    console.log(`  Total scanned: ${mediaStats.total}`);
    console.log(`  ${DRY_RUN ? 'Would update' : 'Updated'}: ${mediaStats.updated}`);
    console.log(`  Skipped: ${mediaStats.skipped}`);
    console.log('');
    console.log(`SignageAsset:`);
    console.log(`  Total scanned: ${signageStats.total}`);
    console.log(`  ${DRY_RUN ? 'Would update' : 'Updated'}: ${signageStats.updated}`);
    console.log(`  Skipped: ${signageStats.skipped}`);
    console.log('');
    console.log(`MIEntity:`);
    console.log(`  Total scanned: ${miEntityStats.total}`);
    console.log(`  ${DRY_RUN ? 'Would update' : 'Updated'}: ${miEntityStats.updated}`);
    console.log(`  Skipped: ${miEntityStats.skipped}`);
    console.log('');
    console.log(`Total:`);
    const totalScanned = mediaStats.total + signageStats.total + miEntityStats.total;
    const totalUpdated = mediaStats.updated + signageStats.updated + miEntityStats.updated;
    console.log(`  Total scanned: ${totalScanned}`);
    console.log(`  Total ${DRY_RUN ? 'would update' : 'updated'}: ${totalUpdated}`);
    console.log('');

    if (DRY_RUN) {
      console.log('⚠️  DRY RUN mode - no changes were made');
      console.log('Set DRY_RUN = false and run again to perform updates\n');
    } else {
      console.log('✅ Migration complete!\n');
    }
  } catch (error) {
    console.error('❌ Migration error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

