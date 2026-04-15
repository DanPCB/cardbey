// src/services/s3Cleanup.js
// S3 cleanup service for removing unused/original assets

import { S3Client, ListObjectsV2Command, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
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
 * Cleanup configuration
 */
const CLEANUP_CONFIG = {
  // Delete original videos after N days if optimized version exists
  deleteOriginalAfterDays: parseInt(process.env.S3_CLEANUP_ORIGINAL_AFTER_DAYS || '30', 10),
  
  // Delete unused assets (not in any playlist) after N days
  deleteUnusedAfterDays: parseInt(process.env.S3_CLEANUP_UNUSED_AFTER_DAYS || '90', 10),
  
  // Dry run mode (don't actually delete, just log what would be deleted)
  dryRun: process.env.S3_CLEANUP_DRY_RUN === 'true',
};

/**
 * Get all S3 objects in the bucket (paginated)
 */
async function listAllS3Objects(prefix = '') {
  const bucketName = getBucketName();
  const objects = [];
  let continuationToken = null;
  
  do {
    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    });
    
    const response = await s3Client.send(command);
    
    if (response.Contents) {
      objects.push(...response.Contents);
    }
    
    continuationToken = response.NextContinuationToken;
  } while (continuationToken);
  
  return objects;
}

/**
 * Delete an S3 object
 */
async function deleteS3Object(key) {
  const bucketName = getBucketName();
  if (CLEANUP_CONFIG.dryRun) {
    info('S3_CLEANUP', 'Would delete S3 object (dry run)', { key });
    return { deleted: false, dryRun: true };
  }
  
  try {
    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    });
    
    await s3Client.send(command);
    info('S3_CLEANUP', 'Deleted S3 object', { key });
    return { deleted: true, dryRun: false };
  } catch (err) {
    error('S3_CLEANUP', 'Failed to delete S3 object', {
      key,
      errorMessage: err.message,
    });
    throw err;
  }
}

/**
 * Check if a media asset is referenced in any playlist
 */
async function isMediaInUse(mediaId) {
  const count = await prisma.playlistItem.count({
    where: {
      mediaId,
    },
  });
  
  return count > 0;
}

/**
 * Get all media records from database
 */
async function getAllMediaRecords() {
  return await prisma.media.findMany({
    select: {
      id: true,
      url: true,
      optimizedUrl: true,
      optimizedKey: true,
      isOptimized: true,
      optimizedAt: true,
      createdAt: true,
      kind: true,
      storageKey: true,
    },
  });
}

/**
 * Cleanup original videos that have optimized versions
 * Deletes original if optimized version exists and is older than N days
 */
async function cleanupOriginalVideos() {
  info('S3_CLEANUP', 'Starting cleanup of original videos', {
    deleteAfterDays: CLEANUP_CONFIG.deleteOriginalAfterDays,
    dryRun: CLEANUP_CONFIG.dryRun,
  });
  
  const allMedia = await getAllMediaRecords();
  const now = Date.now();
  const cutoffTime = now - (CLEANUP_CONFIG.deleteOriginalAfterDays * 24 * 60 * 60 * 1000);
  
  let deletedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  
  for (const media of allMedia) {
    // Only process videos
    if (media.kind !== 'VIDEO') {
      continue;
    }
    
    // Must have optimized version
    if (!media.isOptimized || !media.optimizedUrl || !media.optimizedAt) {
      continue;
    }
    
    // Check if optimized version is old enough
    const optimizedAt = new Date(media.optimizedAt).getTime();
    if (optimizedAt > cutoffTime) {
      skippedCount++;
      continue; // Too recent, keep original
    }
    
    // Extract S3 key from original URL
    const originalKey = extractS3KeyFromUrl(media.url) || media.storageKey;
    if (!originalKey) {
      warn('S3_CLEANUP', 'Cannot determine original S3 key', {
        mediaId: media.id,
        url: media.url,
      });
      continue;
    }
    
    // Skip if already in optimized/ prefix (shouldn't happen, but safety check)
    if (originalKey.startsWith('optimized/')) {
      continue;
    }
    
    try {
      // Check if object exists in S3
      const bucketName = getBucketName();
      const headCommand = new HeadObjectCommand({
        Bucket: bucketName,
        Key: originalKey,
      });
      
      try {
        await s3Client.send(headCommand);
        // Object exists, delete it
        await deleteS3Object(originalKey);
        deletedCount++;
      } catch (err) {
        if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
          // Already deleted, skip
          skippedCount++;
        } else {
          throw err;
        }
      }
    } catch (err) {
      error('S3_CLEANUP', 'Error cleaning up original video', {
        mediaId: media.id,
        originalKey,
        errorMessage: err.message,
      });
      errorCount++;
    }
  }
  
  info('S3_CLEANUP', 'Finished cleanup of original videos', {
    deletedCount,
    skippedCount,
    errorCount,
    dryRun: CLEANUP_CONFIG.dryRun,
  });
  
  return { deletedCount, skippedCount, errorCount };
}

/**
 * Cleanup unused assets (not referenced in any playlist)
 */
async function cleanupUnusedAssets() {
  info('S3_CLEANUP', 'Starting cleanup of unused assets', {
    deleteAfterDays: CLEANUP_CONFIG.deleteUnusedAfterDays,
    dryRun: CLEANUP_CONFIG.dryRun,
  });
  
  const allMedia = await getAllMediaRecords();
  const now = Date.now();
  const cutoffTime = now - (CLEANUP_CONFIG.deleteUnusedAfterDays * 24 * 60 * 60 * 1000);
  
  let deletedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  
  for (const media of allMedia) {
    // Check if media is in use
    const inUse = await isMediaInUse(media.id);
    if (inUse) {
      skippedCount++;
      continue; // Still in use, keep it
    }
    
    // Check if asset is old enough
    const createdAt = new Date(media.createdAt).getTime();
    if (createdAt > cutoffTime) {
      skippedCount++;
      continue; // Too recent, keep it
    }
    
    // Extract S3 keys to delete
    const keysToDelete = [];
    
    // Original file
    const originalKey = extractS3KeyFromUrl(media.url) || media.storageKey;
    if (originalKey && !originalKey.startsWith('optimized/')) {
      keysToDelete.push(originalKey);
    }
    
    // Optimized file (if exists)
    if (media.optimizedKey) {
      keysToDelete.push(media.optimizedKey);
    }
    
    // Delete all keys
    for (const key of keysToDelete) {
      try {
        // Check if object exists
        const bucketName = getBucketName();
        const headCommand = new HeadObjectCommand({
          Bucket: bucketName,
          Key: key,
        });
        
        try {
          await s3Client.send(headCommand);
          // Object exists, delete it
          await deleteS3Object(key);
          deletedCount++;
        } catch (err) {
          if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
            // Already deleted, skip
            skippedCount++;
          } else {
            throw err;
          }
        }
      } catch (err) {
        error('S3_CLEANUP', 'Error deleting unused asset', {
          mediaId: media.id,
          key,
          errorMessage: err.message,
        });
        errorCount++;
      }
    }
    
    // Mark media as deleted in DB (soft delete or hard delete - your choice)
    // For now, we'll just log it - you can add a deletedAt field if needed
    if (!CLEANUP_CONFIG.dryRun && keysToDelete.length > 0) {
      // Optionally: mark as deleted in DB
      // await prisma.media.update({
      //   where: { id: media.id },
      //   data: { deletedAt: new Date() },
      // });
    }
  }
  
  info('S3_CLEANUP', 'Finished cleanup of unused assets', {
    deletedCount,
    skippedCount,
    errorCount,
    dryRun: CLEANUP_CONFIG.dryRun,
  });
  
  return { deletedCount, skippedCount, errorCount };
}

/**
 * Run full cleanup (original videos + unused assets)
 */
export async function runCleanup(options = {}) {
  const startTime = Date.now();
  
  // Override config with options
  const config = {
    ...CLEANUP_CONFIG,
    ...options,
  };
  
  const originalConfig = CLEANUP_CONFIG;
  Object.assign(CLEANUP_CONFIG, config);
  
  try {
    info('S3_CLEANUP', 'Starting S3 cleanup', {
      deleteOriginalAfterDays: CLEANUP_CONFIG.deleteOriginalAfterDays,
      deleteUnusedAfterDays: CLEANUP_CONFIG.deleteUnusedAfterDays,
      dryRun: CLEANUP_CONFIG.dryRun,
    });
    
    // Cleanup original videos
    const originalResults = await cleanupOriginalVideos();
    
    // Cleanup unused assets
    const unusedResults = await cleanupUnusedAssets();
    
    const durationMs = Date.now() - startTime;
    
    const summary = {
      originalVideos: originalResults,
      unusedAssets: unusedResults,
      totalDeleted: originalResults.deletedCount + unusedResults.deletedCount,
      totalSkipped: originalResults.skippedCount + unusedResults.skippedCount,
      totalErrors: originalResults.errorCount + unusedResults.errorCount,
      durationMs,
      dryRun: CLEANUP_CONFIG.dryRun,
    };
    
    info('S3_CLEANUP', 'S3 cleanup completed', summary);
    
    return summary;
  } finally {
    // Restore original config
    Object.assign(CLEANUP_CONFIG, originalConfig);
  }
}


