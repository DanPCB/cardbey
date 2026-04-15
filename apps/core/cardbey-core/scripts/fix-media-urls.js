/**
 * One-time migration script to fix old media URLs in the database
 * 
 * Replaces http://192.168.1.12:3001 with http://192.168.1.3:3001 in all URL fields
 * 
 * Usage:
 *   npm run fix-media-urls
 * 
 * Dry run mode:
 *   DRY_RUN=true npm run fix-media-urls
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const OLD_BASE = 'http://192.168.1.12:3001';
const NEW_BASE = 'http://192.168.1.3:3001';
const DRY_RUN = process.env.DRY_RUN === 'true';

/**
 * Replace old base URL with new base URL in a string
 */
function replaceBaseUrl(value) {
  if (!value || typeof value !== 'string') {
    return value;
  }
  return value.replace(OLD_BASE, NEW_BASE);
}

/**
 * Update a single field in a model
 */
async function updateField(modelName, fieldName, whereClause = {}) {
  const model = prisma[modelName];
  if (!model) {
    console.warn(`[fix-media-urls] Model ${modelName} not found, skipping`);
    return { scanned: 0, updated: 0 };
  }

  try {
    // Find all rows where the field contains OLD_BASE
    const rows = await model.findMany({
      where: {
        ...whereClause,
        [fieldName]: {
          contains: OLD_BASE,
        },
      },
      select: {
        id: true,
        [fieldName]: true,
      },
    });

    let updatedCount = 0;

    for (const row of rows) {
      const oldValue = row[fieldName];
      const newValue = replaceBaseUrl(oldValue);

      if (newValue !== oldValue) {
        if (DRY_RUN) {
          console.log(`[fix-media-urls] DRY RUN: would update ${modelName}(id=${row.id}) ${fieldName}`);
          console.log(`  Old: ${oldValue}`);
          console.log(`  New: ${newValue}`);
        } else {
          await model.update({
            where: { id: row.id },
            data: { [fieldName]: newValue },
          });
          console.log(`[fix-media-urls] Updated ${modelName}(id=${row.id}) ${fieldName}`);
        }
        updatedCount++;
      }
    }

    return { scanned: rows.length, updated: updatedCount };
  } catch (error) {
    console.error(`[fix-media-urls] Error updating ${modelName}.${fieldName}:`, error.message);
    return { scanned: 0, updated: 0, error: error.message };
  }
}

/**
 * Recursively replace OLD_BASE with NEW_BASE in an object/array
 */
function replaceBaseUrlInObject(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return replaceBaseUrl(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => replaceBaseUrlInObject(item));
  }

  if (typeof obj === 'object') {
    const updated = {};
    for (const [key, value] of Object.entries(obj)) {
      updated[key] = replaceBaseUrlInObject(value);
    }
    return updated;
  }

  return obj;
}

/**
 * Update JSON fields that may contain URLs
 */
async function updateJsonField(modelName, fieldName, whereClause = {}) {
  const model = prisma[modelName];
  if (!model) {
    console.warn(`[fix-media-urls] Model ${modelName} not found, skipping`);
    return { scanned: 0, updated: 0 };
  }

  try {
    // Find all rows where the JSON field might contain OLD_BASE
    // We need to fetch all rows and check JSON content
    const rows = await model.findMany({
      where: whereClause,
      select: {
        id: true,
        [fieldName]: true,
      },
    });

    let updatedCount = 0;

    for (const row of rows) {
      const jsonValue = row[fieldName];
      if (!jsonValue) continue;

      // Check if JSON contains OLD_BASE
      const jsonStr = typeof jsonValue === 'string' 
        ? jsonValue 
        : JSON.stringify(jsonValue);
      
      if (!jsonStr.includes(OLD_BASE)) {
        continue;
      }

      // Parse and update
      let parsed;
      try {
        parsed = typeof jsonValue === 'string' 
          ? JSON.parse(jsonValue) 
          : jsonValue;
      } catch {
        // Not valid JSON, treat as plain string
        if (typeof jsonValue === 'string' && jsonValue.includes(OLD_BASE)) {
          const updatedValue = replaceBaseUrl(jsonValue);
          if (updatedValue !== jsonValue) {
            if (DRY_RUN) {
              console.log(`[fix-media-urls] DRY RUN: would update ${modelName}(id=${row.id}) ${fieldName}`);
              console.log(`  Old: ${jsonValue}`);
              console.log(`  New: ${updatedValue}`);
            } else {
              await model.update({
                where: { id: row.id },
                data: { [fieldName]: updatedValue },
              });
              console.log(`[fix-media-urls] Updated ${modelName}(id=${row.id}) ${fieldName}`);
            }
            updatedCount++;
          }
        }
        continue;
      }

      // Recursively replace URLs in JSON object/array
      const updatedJson = replaceBaseUrlInObject(parsed);
      const updatedStr = JSON.stringify(updatedJson);
      const originalStr = JSON.stringify(parsed);

      if (updatedStr !== originalStr) {
        if (DRY_RUN) {
          console.log(`[fix-media-urls] DRY RUN: would update ${modelName}(id=${row.id}) ${fieldName}`);
          console.log(`  Old: ${originalStr.substring(0, 200)}${originalStr.length > 200 ? '...' : ''}`);
          console.log(`  New: ${updatedStr.substring(0, 200)}${updatedStr.length > 200 ? '...' : ''}`);
        } else {
          await model.update({
            where: { id: row.id },
            data: { [fieldName]: updatedJson },
          });
          console.log(`[fix-media-urls] Updated ${modelName}(id=${row.id}) ${fieldName}`);
        }
        updatedCount++;
      }
    }

    return { scanned: rows.length, updated: updatedCount };
  } catch (error) {
    console.error(`[fix-media-urls] Error updating ${modelName}.${fieldName}:`, error.message);
    return { scanned: 0, updated: 0, error: error.message };
  }
}

/**
 * Main migration function
 */
async function main() {
  console.log('[fix-media-urls] Starting media URL migration');
  console.log(`[fix-media-urls] Mode: ${DRY_RUN ? 'DRY RUN (no changes will be made)' : 'LIVE (updates will be performed)'}`);
  console.log(`[fix-media-urls] Old base: ${OLD_BASE}`);
  console.log(`[fix-media-urls] New base: ${NEW_BASE}`);
  console.log('');

  const results = [];

  // Media model
  console.log('[fix-media-urls] Processing Media model...');
  const mediaUrl = await updateField('media', 'url');
  results.push({ model: 'Media', field: 'url', ...mediaUrl });
  
  const mediaOptimizedUrl = await updateField('media', 'optimizedUrl');
  results.push({ model: 'Media', field: 'optimizedUrl', ...mediaOptimizedUrl });

  // SignageAsset model
  console.log('[fix-media-urls] Processing SignageAsset model...');
  const signageUrl = await updateField('signageAsset', 'url');
  results.push({ model: 'SignageAsset', field: 'url', ...signageUrl });

  // MIEntity model
  console.log('[fix-media-urls] Processing MIEntity model...');
  const miFileUrl = await updateField('mIEntity', 'fileUrl');
  results.push({ model: 'MIEntity', field: 'fileUrl', ...miFileUrl });
  
  const miPreviewUrl = await updateField('mIEntity', 'previewUrl');
  results.push({ model: 'MIEntity', field: 'previewUrl', ...miPreviewUrl });

  // Content model
  console.log('[fix-media-urls] Processing Content model...');
  const contentThumbnailUrl = await updateField('content', 'thumbnailUrl');
  results.push({ model: 'Content', field: 'thumbnailUrl', ...contentThumbnailUrl });

  // CreativeTemplate model
  console.log('[fix-media-urls] Processing CreativeTemplate model...');
  const templateThumbnailUrl = await updateField('creativeTemplate', 'thumbnailUrl');
  results.push({ model: 'CreativeTemplate', field: 'thumbnailUrl', ...templateThumbnailUrl });

  // GreetingCard model
  console.log('[fix-media-urls] Processing GreetingCard model...');
  const greetingCoverImageUrl = await updateField('greetingCard', 'coverImageUrl');
  results.push({ model: 'GreetingCard', field: 'coverImageUrl', ...greetingCoverImageUrl });
  
  const greetingMediaUrl = await updateField('greetingCard', 'mediaUrl');
  results.push({ model: 'GreetingCard', field: 'mediaUrl', ...greetingMediaUrl });

  // MiVideoTemplate model
  console.log('[fix-media-urls] Processing MiVideoTemplate model...');
  const videoBackgroundUrl = await updateField('miVideoTemplate', 'backgroundUrl');
  results.push({ model: 'MiVideoTemplate', field: 'backgroundUrl', ...videoBackgroundUrl });
  
  const videoPosterUrl = await updateField('miVideoTemplate', 'posterUrl');
  results.push({ model: 'MiVideoTemplate', field: 'posterUrl', ...videoPosterUrl });

  // MiMusicTrack model
  console.log('[fix-media-urls] Processing MiMusicTrack model...');
  const musicAudioUrl = await updateField('miMusicTrack', 'audioUrl');
  results.push({ model: 'MiMusicTrack', field: 'audioUrl', ...musicAudioUrl });

  // Product model
  console.log('[fix-media-urls] Processing Product model...');
  const productImageUrl = await updateField('product', 'imageUrl');
  results.push({ model: 'Product', field: 'imageUrl', ...productImageUrl });
  
  // Product.images is JSON array, handle separately
  const productImages = await updateJsonField('product', 'images');
  results.push({ model: 'Product', field: 'images', ...productImages });

  // User model
  console.log('[fix-media-urls] Processing User model...');
  const userAvatarUrl = await updateField('user', 'avatarUrl');
  results.push({ model: 'User', field: 'avatarUrl', ...userAvatarUrl });

  // Business model - logo is JSON string
  console.log('[fix-media-urls] Processing Business model...');
  const businessLogo = await updateJsonField('business', 'logo');
  results.push({ model: 'Business', field: 'logo', ...businessLogo });

  // Print summary
  console.log('');
  console.log('='.repeat(60));
  console.log('[fix-media-urls] Summary:');
  console.log('='.repeat(60));

  let totalScanned = 0;
  let totalUpdated = 0;

  for (const result of results) {
    if (result.updated > 0 || result.scanned > 0) {
      console.log(`[fix-media-urls] ${result.model}.${result.field}: ${DRY_RUN ? 'would update' : 'updated'} ${result.updated} rows (scanned ${result.scanned})`);
      totalScanned += result.scanned;
      totalUpdated += result.updated;
    }
  }

  console.log('');
  console.log(`[fix-media-urls] Total rows scanned: ${totalScanned}`);
  console.log(`[fix-media-urls] Total rows ${DRY_RUN ? 'would be updated' : 'updated'}: ${totalUpdated}`);

  if (DRY_RUN) {
    console.log('');
    console.log('[fix-media-urls] DRY RUN mode - no changes were made');
    console.log('[fix-media-urls] Set DRY_RUN=false or remove DRY_RUN env var to perform updates');
  } else {
    console.log('');
    console.log('[fix-media-urls] Migration complete!');
  }

  console.log('');
}

// Run migration
main()
  .catch((error) => {
    console.error('[fix-media-urls] Migration failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

/**
 * Testing Checklist:
 * 
 * 1. Before running:
 *    - Create or confirm at least one Media row with url starting with OLD_BASE
 *    - Example SQL: 
 *      INSERT INTO Media (id, url, kind, mime, sizeBytes, createdAt)
 *      VALUES ('test-id', 'http://192.168.1.12:3001/uploads/media/test.mp4', 'VIDEO', 'video/mp4', 1000, datetime('now'));
 * 
 * 2. Run dry run first:
 *    cd apps/core/cardbey-core
 *    
 *    On Linux/Mac:
 *      DRY_RUN=true npm run fix-media-urls
 *    
 *    On Windows PowerShell:
 *      $env:DRY_RUN="true"; npm run fix-media-urls
 *    
 *    On Windows CMD:
 *      set DRY_RUN=true && npm run fix-media-urls
 * 
 * 3. Verify dry run output:
 *    - Check that it logs rows that would be updated
 *    - Verify the old and new URLs are correct
 * 
 * 4. Run live migration:
 *    npm run fix-media-urls
 *    (or remove/unset DRY_RUN env var)
 * 
 * 5. Verify results:
 *    - Check that affected rows now contain NEW_BASE in their URL fields
 *    - Run the script again - should result in 0 rows updated (idempotent)
 * 
 * 6. Reload dashboard Asset Library:
 *    - The "[AssetLibraryPane] Video failed to load - URL points to different IP than Core server" warnings
 *      should disappear for migrated items
 */






