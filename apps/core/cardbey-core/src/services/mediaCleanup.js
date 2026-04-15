// src/services/mediaCleanup.js
// Media cleanup service for removing unused/original assets from S3

import { S3Client, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { PrismaClient } from '@prisma/client';
import { info, warn, error } from '../lib/logger.js';
import { extractS3KeyFromUrl } from '../lib/s3Client.js';

const prisma = new PrismaClient();

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-southeast-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

// Lazy initialization - only check bucket name when functions are called
// This allows the module to be imported even if S3 is not configured
function getBucketName() {
  const bucketName = process.env.S3_BUCKET_NAME;
  if (!bucketName) {
    throw new Error('S3_BUCKET_NAME environment variable is not set. S3 cleanup features require this variable.');
  }
  return bucketName;
}

/**
 * Delete an S3 object
 */
async function deleteS3Object(key) {
  const bucketName = getBucketName();
  try {
    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    });
    
    await s3Client.send(command);
    info('CLEANUP', 'Deleted S3 object', { key });
    return true;
  } catch (err) {
    error('CLEANUP', 'Failed to delete S3 object', {
      key,
      errorMessage: err.message,
    });
    return false;
  }
}

/**
 * Check if S3 object exists
 */
async function s3ObjectExists(key) {
  const bucketName = getBucketName();
  try {
    const command = new HeadObjectCommand({
      Bucket: bucketName,
      Key: key,
    });
    
    await s3Client.send(command);
    return true;
  } catch (err) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw err;
  }
}

/**
 * Cleanup orphan assets (not referenced in any playlist)
 * 
 * @param {object} options - Cleanup options
 * @param {number} options.olderThanDays - Only delete assets older than N days (default: 30)
 * @param {number} options.maxAssets - Maximum assets to process per run (default: 500)
 * @param {boolean} options.dryRun - If true, don't actually delete (default: false)
 * @returns {Promise<object>} Summary of cleanup operation
 */
export async function cleanupOrphanAssets(options = {}) {
  const {
    olderThanDays = 30,
    maxAssets = 500,
    dryRun = false,
  } = options;
  
  const startTime = Date.now();
  const cutoffDate = new Date(Date.now() - (olderThanDays * 24 * 60 * 60 * 1000));
  
  info('CLEANUP', 'Cleanup orphans started', {
    olderThanDays,
    maxAssets,
    dryRun,
    cutoffDate: cutoffDate.toISOString(),
  });
  
  // Find orphan assets
  // Assets that:
  // - Are not referenced in any playlist items
  // - Are older than cutoffDate
  // - Are not soft-deleted (if deletedAt field exists, we'd check it here)
  const orphanAssets = await prisma.media.findMany({
    where: {
      createdAt: {
        lt: cutoffDate,
      },
      // Not referenced in any playlist items
      items: {
        none: {},
      },
      // If we had deletedAt, we'd add: deletedAt: null
    },
    take: maxAssets,
    orderBy: {
      createdAt: 'asc', // Oldest first
    },
    select: {
      id: true,
      url: true,
      storageKey: true,
      optimizedUrl: true,
      optimizedKey: true,
      createdAt: true,
      kind: true,
    },
  });
  
  let deletedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  const keysToDelete = [];
  
  for (const asset of orphanAssets) {
    const keys = [];
    
    // Original file
    if (asset.storageKey) {
      keys.push(asset.storageKey);
    } else if (asset.url) {
      const extractedKey = extractS3KeyFromUrl(asset.url);
      if (extractedKey && !extractedKey.startsWith('optimized/')) {
        keys.push(extractedKey);
      }
    }
    
    // Optimized file (if exists)
    if (asset.optimizedKey) {
      keys.push(asset.optimizedKey);
    } else if (asset.optimizedUrl) {
      const extractedKey = extractS3KeyFromUrl(asset.optimizedUrl);
      if (extractedKey) {
        keys.push(extractedKey);
      }
    }
    
    // Delete S3 objects
    for (const key of keys) {
      if (dryRun) {
        info('CLEANUP', 'Would delete S3 object (dry run)', {
          assetId: asset.id,
          key,
        });
        keysToDelete.push(key);
        deletedCount++;
      } else {
        // Check if object exists
        const exists = await s3ObjectExists(key);
        if (exists) {
          const deleted = await deleteS3Object(key);
          if (deleted) {
            deletedCount++;
            keysToDelete.push(key);
          } else {
            errorCount++;
          }
        } else {
          skippedCount++;
          info('CLEANUP', 'S3 object already deleted', {
            assetId: asset.id,
            key,
          });
        }
      }
    }
    
    // Hard delete the asset record (or soft delete if you prefer)
    if (!dryRun && keysToDelete.length > 0) {
      try {
        await prisma.media.delete({
          where: { id: asset.id },
        });
        info('CLEANUP', 'Deleted orphan asset record', {
          assetId: asset.id,
          keysDeleted: keysToDelete.length,
        });
      } catch (err) {
        error('CLEANUP', 'Failed to delete asset record', {
          assetId: asset.id,
          errorMessage: err.message,
        });
        errorCount++;
      }
    }
  }
  
  // Check if more orphans exist
  const totalOrphans = await prisma.media.count({
    where: {
      createdAt: {
        lt: cutoffDate,
      },
      items: {
        none: {},
      },
    },
  });
  
  const remaining = totalOrphans - orphanAssets.length;
  if (remaining > 0) {
    warn('CLEANUP', 'More orphan assets remain than cleanup limit', {
      processed: orphanAssets.length,
      remaining,
      totalOrphans,
      maxAssets,
    });
  }
  
  const durationMs = Date.now() - startTime;
  
  info('CLEANUP', 'Cleanup orphans finished', {
    deletedCount,
    skippedCount,
    errorCount,
    processed: orphanAssets.length,
    remaining,
    durationMs,
    dryRun,
  });
  
  return {
    deletedCount,
    skippedCount,
    errorCount,
    processed: orphanAssets.length,
    remaining,
    durationMs,
  };
}

/**
 * Cleanup original files after optimization
 * 
 * @param {object} options - Cleanup options
 * @param {number} options.gracePeriodDays - Wait N days after optimization before deleting original (default: 7)
 * @param {number} options.maxAssets - Maximum assets to process per run (default: 500)
 * @param {boolean} options.dryRun - If true, don't actually delete (default: false)
 * @returns {Promise<object>} Summary of cleanup operation
 */
export async function cleanupOriginalsAfterOptimization(options = {}) {
  const {
    gracePeriodDays = 7,
    maxAssets = 500,
    dryRun = false,
  } = options;
  
  const startTime = Date.now();
  const cutoffDate = new Date(Date.now() - (gracePeriodDays * 24 * 60 * 60 * 1000));
  
  info('CLEANUP', 'Cleanup originals started', {
    gracePeriodDays,
    maxAssets,
    dryRun,
    cutoffDate: cutoffDate.toISOString(),
  });
  
  // Find assets with optimized versions that are old enough
  const optimizedAssets = await prisma.media.findMany({
    where: {
      isOptimized: true,
      optimizedUrl: {
        not: null,
      },
      optimizedKey: {
        not: null,
      },
      optimizedAt: {
        not: null,
        lt: cutoffDate, // Optimized at least N days ago
      },
      // Must have original storageKey
      storageKey: {
        not: null,
      },
      // Original key should not be in optimized/ prefix (safety check)
      storageKey: {
        not: {
          startsWith: 'optimized/',
        },
      },
    },
    take: maxAssets,
    orderBy: {
      optimizedAt: 'asc', // Oldest optimized first
    },
    select: {
      id: true,
      storageKey: true,
      optimizedKey: true,
      optimizedAt: true,
    },
  });
  
  let deletedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  
  for (const asset of optimizedAssets) {
    const originalKey = asset.storageKey;
    
    if (!originalKey || originalKey.startsWith('optimized/')) {
      skippedCount++;
      continue;
    }
    
    if (dryRun) {
      info('CLEANUP', 'Would delete original S3 object (dry run)', {
        assetId: asset.id,
        originalKey,
        optimizedKey: asset.optimizedKey,
      });
      deletedCount++;
    } else {
      // Check if original exists
      const exists = await s3ObjectExists(originalKey);
      if (exists) {
        const deleted = await deleteS3Object(originalKey);
        if (deleted) {
          deletedCount++;
          
          // Update asset record: clear storageKey (optional, or set a flag)
          try {
            await prisma.media.update({
              where: { id: asset.id },
              data: {
                storageKey: null, // Clear original key
                // If you add originalDeleted flag: originalDeleted: true
              },
            });
            info('CLEANUP', 'Updated asset after original deletion', {
              assetId: asset.id,
              originalKey,
            });
          } catch (err) {
            error('CLEANUP', 'Failed to update asset record', {
              assetId: asset.id,
              errorMessage: err.message,
            });
            // Don't increment errorCount for DB update failure
          }
        } else {
          errorCount++;
        }
      } else {
        skippedCount++;
        info('CLEANUP', 'Original S3 object already deleted', {
          assetId: asset.id,
          originalKey,
        });
        
        // Still update DB to clear storageKey if it's set
        if (asset.storageKey) {
          try {
            await prisma.media.update({
              where: { id: asset.id },
              data: { storageKey: null },
            });
          } catch (err) {
            // Non-fatal
          }
        }
      }
    }
  }
  
  // Check if more candidates exist
  const totalCandidates = await prisma.media.count({
    where: {
      isOptimized: true,
      optimizedUrl: { not: null },
      optimizedKey: { not: null },
      optimizedAt: {
        not: null,
        lt: cutoffDate,
      },
      storageKey: {
        not: null,
        not: { startsWith: 'optimized/' },
      },
    },
  });
  
  const remaining = totalCandidates - optimizedAssets.length;
  if (remaining > 0) {
    warn('CLEANUP', 'More optimized assets remain than cleanup limit', {
      processed: optimizedAssets.length,
      remaining,
      totalCandidates,
      maxAssets,
    });
  }
  
  const durationMs = Date.now() - startTime;
  
  info('CLEANUP', 'Cleanup originals finished', {
    deletedCount,
    skippedCount,
    errorCount,
    processed: optimizedAssets.length,
    remaining,
    durationMs,
    dryRun,
  });
  
  return {
    deletedCount,
    skippedCount,
    errorCount,
    processed: optimizedAssets.length,
    remaining,
    durationMs,
  };
}


