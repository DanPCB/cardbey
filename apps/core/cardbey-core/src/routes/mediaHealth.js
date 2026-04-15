// src/routes/mediaHealth.js
// Media health check API for dashboards and admin

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { info, warn } from '../lib/logger.js';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';

const router = Router();
const prisma = new PrismaClient();

// Internal API secret for authentication
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET;

// Initialize S3 client for optional S3 checks
const s3Client = process.env.S3_BUCKET_NAME ? new S3Client({
  region: process.env.AWS_REGION || 'ap-southeast-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
}) : null;

const bucketName = process.env.S3_BUCKET_NAME;

/**
 * Middleware to validate internal API secret
 */
function validateInternalSecret(req, res, next) {
  const providedSecret = req.get('x-internal-secret');
  
  if (!INTERNAL_API_SECRET) {
    warn('HEALTH', 'INTERNAL_API_SECRET not configured', {
      endpoint: req.path,
      ip: req.ip,
    });
    return res.status(500).json({
      ok: false,
      error: 'Health check not configured',
    });
  }
  
  if (!providedSecret || providedSecret !== INTERNAL_API_SECRET) {
    warn('HEALTH', 'Invalid internal API secret', {
      endpoint: req.path,
      ip: req.ip,
      hasSecret: !!providedSecret,
    });
    return res.status(401).json({
      ok: false,
      error: 'Unauthorized',
      message: 'Invalid or missing x-internal-secret header',
    });
  }
  
  next();
}

/**
 * Check if S3 object exists
 */
async function checkS3ObjectExists(key) {
  if (!s3Client || !bucketName) {
    return { exists: null, error: 'S3 not configured' };
  }
  
  try {
    const command = new HeadObjectCommand({
      Bucket: bucketName,
      Key: key,
    });
    
    await s3Client.send(command);
    return { exists: true };
  } catch (err) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      return { exists: false };
    }
    return { exists: null, error: err.message };
  }
}

/**
 * GET /api/admin/media/health
 * Media health check endpoint
 * 
 * Query params:
 *   - checkS3=1 (optional) - Also check S3 object existence
 */
router.get('/health', validateInternalSecret, async (req, res) => {
  try {
    const checkS3 = req.query.checkS3 === '1' || req.query.checkS3 === 'true';
    const startTime = Date.now();
    
    // Gather statistics
    const [
      totalAssets,
      assetsWithoutUrl,
      assetsWithoutStorageKey,
      allAssets,
      allPlaylistItems,
    ] = await Promise.all([
      prisma.media.count(),
      prisma.media.count({ where: { url: null } }),
      prisma.media.count({ where: { storageKey: null } }),
      prisma.media.findMany({
        select: {
          id: true,
          url: true,
          storageKey: true,
          kind: true,
          createdAt: true,
          items: {
            select: {
              id: true,
              playlistId: true,
              playlist: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      }),
      prisma.playlistItem.findMany({
        include: {
          media: {
            select: {
              id: true,
              url: true,
              storageKey: true,
            },
          },
          playlist: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
    ]);
    
    // Find orphan assets (not referenced in any playlist)
    const assetsInPlaylists = new Set();
    allPlaylistItems.forEach(item => {
      if (item.mediaId) {
        assetsInPlaylists.add(item.mediaId);
      }
    });
    
    const orphanAssets = allAssets
      .filter(asset => !assetsInPlaylists.has(asset.id))
      .slice(0, 20); // Sample up to 20
    
    const orphanAssetsCount = allAssets.filter(asset => !assetsInPlaylists.has(asset.id)).length;
    
    // Find assets without URL or storageKey
    const assetsWithoutUrlList = allAssets
      .filter(asset => !asset.url)
      .slice(0, 20);
    
    const assetsWithoutStorageKeyList = allAssets
      .filter(asset => !asset.storageKey)
      .slice(0, 20);
    
    // Find broken playlist items (media doesn't exist or is null)
    const brokenPlaylistItems = allPlaylistItems
      .filter(item => !item.media || item.media === null)
      .slice(0, 20)
      .map(item => ({
        playlistItemId: item.id,
        playlistId: item.playlist.id,
        playlistName: item.playlist.name,
        mediaId: item.mediaId,
      }));
    
    const brokenPlaylistItemsCount = allPlaylistItems.filter(item => !item.media || item.media === null).length;
    
    // Count assets in playlists
    const assetsInPlaylistsCount = assetsInPlaylists.size;
    
    // Optional S3 check
    let missingS3ObjectsCount = 0;
    const missingS3Objects = [];
    
    if (checkS3 && s3Client && bucketName) {
      // Check up to 20 assets with storageKey
      const assetsToCheck = allAssets
        .filter(asset => asset.storageKey)
        .slice(0, 20);
      
      for (const asset of assetsToCheck) {
        const result = await checkS3ObjectExists(asset.storageKey);
        if (result.exists === false) {
          missingS3ObjectsCount++;
          missingS3Objects.push({
            assetId: asset.id,
            storageKey: asset.storageKey,
            url: asset.url,
          });
        }
      }
    }
    
    const summary = {
      totalAssets,
      assetsWithoutUrl: assetsWithoutUrlList.length,
      assetsWithoutStorageKey: assetsWithoutStorageKeyList.length,
      assetsInPlaylistsCount,
      orphanAssetsCount,
      brokenPlaylistItemsCount,
      ...(checkS3 ? { missingS3ObjectsCount } : {}),
    };
    
    const samples = {
      assetsWithoutUrl: assetsWithoutUrlList.map(asset => ({
        assetId: asset.id,
        kind: asset.kind,
        createdAt: asset.createdAt,
      })),
      assetsWithoutStorageKey: assetsWithoutStorageKeyList.map(asset => ({
        assetId: asset.id,
        url: asset.url,
        kind: asset.kind,
        createdAt: asset.createdAt,
      })),
      orphanAssets: orphanAssets.map(asset => ({
        assetId: asset.id,
        url: asset.url,
        storageKey: asset.storageKey,
        kind: asset.kind,
        createdAt: asset.createdAt,
      })),
      brokenPlaylistItems,
      ...(checkS3 ? { missingS3Objects } : {}),
    };
    
    const durationMs = Date.now() - startTime;
    
    info('HEALTH', 'Media health check run', {
      ...summary,
      samplesCounts: {
        assetsWithoutUrl: samples.assetsWithoutUrl.length,
        assetsWithoutStorageKey: samples.assetsWithoutStorageKey.length,
        orphanAssets: samples.orphanAssets.length,
        brokenPlaylistItems: samples.brokenPlaylistItems.length,
        ...(checkS3 ? { missingS3Objects: samples.missingS3Objects?.length || 0 } : {}),
      },
      checkS3,
      durationMs,
      requestId: req.requestId,
    });
    
    return res.json({
      ok: true,
      summary,
      samples,
      durationMs,
    });
  } catch (err) {
    warn('HEALTH', 'Media health check failed', {
      errorMessage: err.message,
      errorStack: err.stack?.substring(0, 300),
      requestId: req.requestId,
    });
    return res.status(500).json({
      ok: false,
      error: 'Health check failed',
      message: err.message,
    });
  }
});

export default router;


