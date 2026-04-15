/**
 * Signage REST API Routes
 * Clean REST endpoints for SignageAsset and SignagePlaylist CRUD operations
 * Used by Cardbey Pro playlist editor in the dashboard
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth.js';
import multer from 'multer';
import { lookup as mimeLookup } from 'mime-types';
import { resolvePublicUrl, buildMediaUrl } from '../utils/publicUrl.js';
import { getCoreBaseUrl, normalizeMediaObject, normalizeMediaUrl } from '../utils/normalizeMediaUrl.js';
import { uploadBufferToS3 } from '../lib/s3Client.js';
import { info, error } from '../lib/logger.js';
import { createTempPath, safeUnlink } from '../lib/tempFiles.js';
import { getTranslatedField } from '../services/i18n/translationUtils.js';
import fs from 'fs/promises';
import path from 'path';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * Extract language code from Accept-Language header
 * Supports formats like "en", "en-US", "vi", "vi-VN"
 * Returns the primary language code (e.g., "en" or "vi")
 */
function extractLanguageFromHeader(acceptLanguage) {
  if (!acceptLanguage) return null;
  
  // Parse Accept-Language header (e.g., "en-US,en;q=0.9,vi;q=0.8")
  const languages = acceptLanguage.split(',').map(lang => {
    const parts = lang.split(';')[0].trim().toLowerCase();
    return parts.split('-')[0]; // Extract primary language code
  });
  
  // Return first supported language (en or vi)
  const supported = ['en', 'vi'];
  return languages.find(lang => supported.includes(lang)) || null;
}

// Configure multer for file uploads (memory storage for S3 uploads)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB max file size
  },
});

// Lazy load sharp for image metadata
let sharp = null;
async function getSharp() {
  if (sharp) return sharp;
  try {
    const sharpModule = await import('sharp');
    sharp = sharpModule.default;
    return sharp;
  } catch (err) {
    console.warn('[SignageRoutes] Failed to load sharp:', err.message);
    return null;
  }
}

// Lazy load ffmpeg for video metadata
let ffmpeg = null;
let ffmpegInitialized = false;
async function initializeFfmpeg() {
  if (ffmpegInitialized) return ffmpeg;
  try {
    const ffmpegModule = await import('fluent-ffmpeg');
    ffmpeg = ffmpegModule.default;
    ffmpegInitialized = true;
    return ffmpeg;
  } catch (err) {
    console.warn('[SignageRoutes] Failed to load ffmpeg:', err.message);
    return null;
  }
}

/**
 * Require tenant/store context from request
 * Extracts tenantId/storeId from query params, body, or auth context
 * For dev mode, allows default tenant/store when none is passed
 * 
 * Business model doesn't have tenantId/storeId fields, so we derive them:
 * - tenantId: userId (the user owns the tenant)
 * - storeId: business.id (the business/store ID)
 * 
 * @param {express.Request} req - Express request object
 * @returns {{ tenantId: string, storeId: string }} Tenant and store IDs
 * @throws {Error} If tenantId/storeId are required but not found (unless in dev mode with defaults)
 */
function requireTenantStoreContext(req) {
  // Try to extract from query params first (highest priority)
  let tenantId = req.query.tenantId;
  let storeId = req.query.storeId;
  
  // Fall back to body params
  if (!tenantId) tenantId = req.body?.tenantId;
  if (!storeId) storeId = req.body?.storeId;
  
  // Fall back to auth context
  // Business model doesn't have tenantId/storeId, so derive from user/business:
  // - tenantId = userId (user owns the tenant)
  // - storeId = business.id (business/store ID)
  if (!tenantId && req.userId) {
    tenantId = req.userId; // Use userId as tenantId
  }
  if (!storeId && req.user?.business?.id) {
    storeId = req.user.business.id; // Use business.id as storeId
  }
  
  // Legacy fallback (if business had tenantId/storeId fields, but it doesn't)
  if (!tenantId) tenantId = req.user?.business?.tenantId || req.workspace?.tenantId;
  if (!storeId) storeId = req.user?.business?.storeId || req.workspace?.storeId;
  
  // For dev mode, allow default tenant/store when none is passed
  const isDev = process.env.NODE_ENV !== 'production';
  if (isDev) {
    // Use environment variables or hardcoded defaults for dev
    tenantId = tenantId || process.env.DEV_TENANT_ID || req.userId || 'temp';
    storeId = storeId || process.env.DEV_STORE_ID || req.user?.business?.id || 'temp';
  }
  
  // Convert to strings and trim
  tenantId = tenantId ? String(tenantId).trim() : null;
  storeId = storeId ? String(storeId).trim() : null;
  
  if (!tenantId || !storeId) {
    throw new Error('tenantId and storeId are required (can come from query params, body, or auth context)');
  }
  
  return { tenantId, storeId };
}

/**
 * Helper to validate tenant/store access
 */
async function validateTenantStoreAccess(tenantId, storeId, resourceTenantId, resourceStoreId) {
  if (!tenantId || !storeId) {
    throw new Error('tenantId and storeId are required');
  }
  if (resourceTenantId !== tenantId || resourceStoreId !== storeId) {
    throw new Error('Access denied: resource does not belong to your tenant/store');
  }
}

/**
 * Dashboard playlist row → API item. Supports SignageAsset-backed and Media-backed rows.
 * Returns null if FKs are broken (orphan row).
 */
async function formatSignagePlaylistItemForApi(item, req, coreBaseUrl, getEntityByLink, lang = null) {
  let miEntity = null;
  try {
    miEntity = await getEntityByLink({ screenItemId: item.id });
  } catch (err) {
    console.warn(`[SignageRoutes] Failed to fetch MIEntity for item ${item.id}:`, err.message);
  }

  if (item.asset) {
    const assetName =
      lang != null && lang !== ''
        ? getTranslatedField(item.asset, 'name', lang) || item.asset.tags || null
        : item.asset.tags || null;
    const itemObj = {
      id: item.id,
      assetId: item.assetId || '',
      mediaId: item.mediaId || '',
      orderIndex: item.orderIndex,
      durationS: item.durationS,
      miEntity: miEntity || null,
      asset: {
        id: item.asset.id,
        url: normalizeMediaUrl(item.asset.url, coreBaseUrl),
        normalizedUrl: normalizeMediaUrl(buildMediaUrl(item.asset.url, req), coreBaseUrl),
        type: item.asset.type,
        name: assetName,
        mimeType: null,
        width: null,
        height: null,
        durationS: item.asset.durationS || null,
        createdAt: item.asset.createdAt.toISOString(),
        miEntity: miEntity || null,
      },
    };
    return normalizeMediaObject(itemObj, coreBaseUrl);
  }

  if (item.media) {
    const m = item.media;
    const kind = String(m.kind || 'IMAGE').toLowerCase();
    const itemObj = {
      id: item.id,
      assetId: item.assetId || '',
      mediaId: item.mediaId || '',
      orderIndex: item.orderIndex,
      durationS: item.durationS,
      miEntity: miEntity || null,
      asset: {
        id: m.id,
        url: normalizeMediaUrl(m.url, coreBaseUrl),
        normalizedUrl: normalizeMediaUrl(buildMediaUrl(m.url, req), coreBaseUrl),
        type: kind === 'video' ? 'video' : 'image',
        name: null,
        mimeType: m.mime || null,
        width: m.width ?? null,
        height: m.height ?? null,
        durationS: m.durationS ?? null,
        createdAt: m.createdAt.toISOString(),
        miEntity: miEntity || null,
      },
    };
    return normalizeMediaObject(itemObj, coreBaseUrl);
  }

  console.warn('[SignageRoutes] Orphan PlaylistItem (no Media/SignageAsset row):', item.id, {
    mediaId: item.mediaId,
    assetId: item.assetId,
  });
  return null;
}

/**
 * Register or update MIEntity for a playlist item
 * Called after creating or updating playlist items
 */
async function registerPlaylistItemMIEntity(playlistItem, asset, playlist, userId) {
  try {
    const { registerOrUpdateEntity } = await import('../services/miService.js');
    const {
      buildScreenItemMIBrain,
      inferMediaType,
      buildDimensions,
      inferOrientation,
    } = await import('../mi/miDeviceHelpers.js');

    if (!asset || !playlistItem) {
      return; // Skip if no asset or item
    }

    // Build context for MI helpers
    const context = {
      tenantId: playlist.tenantId,
      storeId: playlist.storeId,
      campaignId: null, // Not available from playlist currently
      userId: userId || null,
      screenOrientation: undefined, // TODO: Get from device/screen if available
    };

    // Use helper functions to build MI data
    const mediaType = inferMediaType({
      type: asset.type,
      mimeType: asset.mimeType || null,
    });
    const dimensions = buildDimensions({
      width: asset.width || null,
      height: asset.height || null,
    });
    const orientation = inferOrientation(
      {
        width: asset.width || null,
        height: asset.height || null,
      },
      context
    );

    // Build file URL (use normalized URL if available, otherwise original)
    const fileUrl = asset.url || '';
    const previewUrl = fileUrl; // Use same URL for preview

    // Build MIBrain using helper
    const miBrain = buildScreenItemMIBrain(
      {
        id: playlistItem.id,
        durationS: playlistItem.durationS,
      },
      {
        id: asset.id,
        type: asset.type,
        url: asset.url,
        durationS: asset.durationS || null,
        width: asset.width || null,
        height: asset.height || null,
        mimeType: asset.mimeType || null,
      },
      context
    );

    // Register or update MIEntity
    await registerOrUpdateEntity({
      productId: playlistItem.id,
      productType: 'screen_item',
      mediaType,
      fileUrl,
      previewUrl,
      dimensions,
      orientation,
      durationSec: playlistItem.durationS || asset.durationS || null,
      createdByUserId: userId || playlist.tenantId, // Use userId if available, fallback to tenantId
      createdByEngine: 'device_engine_v2',
      sourceProjectId: context.campaignId || null,
      tenantId: playlist.tenantId,
      storeId: playlist.storeId,
      campaignId: context.campaignId || null,
      miBrain,
      status: 'active',
      links: {
        screenItemId: playlistItem.id,
      },
    });

    console.log(`[SignageRoutes] Registered MIEntity for playlist item ${playlistItem.id}`);
  } catch (err) {
    // Non-critical error, log but don't fail the request
    console.warn(`[SignageRoutes] Failed to register MIEntity for playlist item ${playlistItem.id}:`, err.message);
  }
}

// ============================================
// SignageAsset APIs
// ============================================

/**
 * GET /api/signage-assets
 * List signage assets (for asset library sidebar)
 * 
 * Query params:
 *   - type?: "image" | "video" | "all" (default: "all")
 *   - q?: string (search term on name/url)
 *   - cursor?: string (pagination cursor)
 *   - limit?: number (default: 50, max: 100)
 */
router.get('/signage-assets', requireAuth, async (req, res) => {
  try {
    const { tenantId, storeId } = requireTenantStoreContext(req);

    const typeFilter = req.query.type;
    const searchTerm = req.query.q ? String(req.query.q).trim() : null;
    const cursor = req.query.cursor ? String(req.query.cursor) : null;
    const limit = Math.min(Number(req.query.limit) || 50, 100);

    // Build where clause
    const where = {
      tenantId,
      storeId,
    };

    if (typeFilter && typeFilter !== 'all') {
      where.type = typeFilter;
    }

    if (searchTerm) {
      where.OR = [
        { url: { contains: searchTerm } },
        { tags: { contains: searchTerm } },
      ];
    }

    // Cursor-based pagination
    if (cursor) {
      where.id = { gt: cursor };
    }

    // Fetch assets
    const assets = await prisma.signageAsset.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1, // Fetch one extra to determine if there's a next page
    });

    const hasNextPage = assets.length > limit;
    const items = hasNextPage ? assets.slice(0, limit) : assets;
    const nextCursor = hasNextPage ? items[items.length - 1].id : null;

    // Fetch MIEntity for each asset
    let miEntitiesMap = new Map();
    try {
      const { getEntityByLink } = await import('../services/miService.js');
      
      // Fetch MIEntity for all assets in parallel
      const miEntityPromises = items.map(async (asset) => {
        try {
          const miEntity = await getEntityByLink({ creativeAssetId: asset.id });
          return { assetId: asset.id, miEntity };
        } catch (err) {
          // Non-critical error, log but continue
          console.warn(`[SignageRoutes] Failed to fetch MIEntity for asset ${asset.id}:`, err.message);
          return { assetId: asset.id, miEntity: null };
        }
      });
      
      const miEntityResults = await Promise.all(miEntityPromises);
      miEntitiesMap = new Map(miEntityResults.map(r => [r.assetId, r.miEntity]));
    } catch (miError) {
      // Non-critical error: MIEntity fetching failed, but assets should still be returned
      console.warn('[SignageRoutes] Failed to fetch MIEntity records:', miError.message);
      // miEntitiesMap will remain empty, all assets will get miEntity: null
    }

    // Format response with normalized URLs and MIEntity
    const coreBaseUrl = getCoreBaseUrl(req);
    const formattedItems = items.map(asset => {
      // Get MIEntity for this asset
      const miEntity = miEntitiesMap.get(asset.id) || null;
      
      // First, normalize the original URL directly (before buildMediaUrl)
      const normalizedOriginalUrl = normalizeMediaUrl(asset.url, coreBaseUrl);
      
      // Build normalized URL for frontend consumption (this will also fix old IPs)
      let normalizedUrl = buildMediaUrl(normalizedOriginalUrl || asset.url, req);
      
      // Double-check: normalize again in case buildMediaUrl didn't catch it
      normalizedUrl = normalizeMediaUrl(normalizedUrl, coreBaseUrl);
      
      const item = {
        id: asset.id,
        url: normalizeMediaUrl(asset.url, coreBaseUrl), // Normalize original URL too
        normalizedUrl, // New field: always a valid absolute URL with correct IP
        type: asset.type,
        name: asset.tags || null, // Use tags as name for now (can be extended)
        mimeType: null, // SignageAsset doesn't have mimeType field
        width: null, // SignageAsset doesn't have width/height
        height: null,
        durationS: asset.durationS || null,
        createdAt: asset.createdAt.toISOString(),
        miEntity: miEntity || null, // Attach MIEntity to each asset
      };
      
      // Final normalization pass to ensure all URL fields are correct
      return normalizeMediaObject(item, coreBaseUrl);
    });

    res.json({
      ok: true,
      items: formattedItems,
      nextCursor: nextCursor || null,
    });
  } catch (err) {
    console.error('[SignageRoutes] List assets error:', err);
    res.status(500).json({
      ok: false,
      error: 'internal_error',
      message: err.message || 'Failed to list assets',
    });
  }
});

/**
 * POST /api/signage-assets/upload
 * Upload a signage asset (image/video)
 * 
 * Content-Type: multipart/form-data
 *   - file: File (required)
 */
router.post('/signage-assets/upload', requireAuth, upload.single('file'), async (req, res) => {
  try {
    const { tenantId, storeId } = requireTenantStoreContext(req);

    if (!req.file) {
      return res.status(400).json({
        ok: false,
        error: 'no_file',
        message: 'No file uploaded. Please send multipart/form-data with field name "file".',
      });
    }

    const buffer = req.file.buffer;
    const mime = req.file.mimetype || mimeLookup(req.file.originalname) || 'application/octet-stream';
    const filename = req.file.originalname || 'upload';

    // Determine asset type
    let assetType = 'html';
    if (mime.startsWith('image/')) {
      assetType = 'image';
    } else if (mime.startsWith('video/')) {
      assetType = 'video';
    }

    // Extract metadata
    let width = null;
    let height = null;
    let durationS = null;

    if (assetType === 'image') {
      const sharpInstance = await getSharp();
      if (sharpInstance) {
        try {
          const meta = await sharpInstance(buffer).metadata();
          width = meta.width ?? null;
          height = meta.height ?? null;
        } catch (err) {
          console.warn('[SignageRoutes] Failed to extract image metadata:', err);
        }
      }
    } else if (assetType === 'video') {
      const tempFilePath = createTempPath('signage-upload-', path.extname(filename));
      try {
        await fs.writeFile(tempFilePath, buffer);
        const ffmpegInstance = await initializeFfmpeg();
        if (ffmpegInstance && ffmpegInstance.ffprobe) {
          try {
            await new Promise((resolve, reject) => {
              const timeout = setTimeout(() => reject(new Error('ffprobe timeout')), 30000);
              ffmpegInstance.ffprobe(tempFilePath, (err, data) => {
                clearTimeout(timeout);
                if (!err && data?.streams?.length) {
                  const v = data.streams.find(s => s.codec_type === 'video');
                  if (v) {
                    width = v.width || null;
                    height = v.height || null;
                  }
                  if (data.format?.duration) {
                    durationS = Math.round(Number(data.format.duration)) || null;
                  }
                }
                resolve();
              });
            });
          } catch (err) {
            console.warn('[SignageRoutes] Failed to extract video metadata:', err);
          }
        }
      } finally {
        await safeUnlink(tempFilePath, 'SIGNAGE_UPLOAD');
      }
    }

    // Upload to S3 (or local storage)
    const { key, url: storageUrl } = await uploadBufferToS3(buffer, filename, mime);
    
    // Normalize URL for storage: prefer relative paths, preserve CloudFront URLs
    // This ensures URLs are portable and don't break when server IP changes
    const { normalizeMediaUrlForStorage } = await import('../utils/publicUrl.js');
    const normalizedStorageUrl = normalizeMediaUrlForStorage(storageUrl, req);

    // Create SignageAsset record with normalized URL
    const asset = await prisma.signageAsset.create({
      data: {
        tenantId,
        storeId,
        type: assetType,
        url: normalizedStorageUrl, // Store relative path or CloudFront URL
        durationS: durationS || (assetType === 'image' ? 8 : 30), // Default duration
        tags: filename, // Use filename as tags/name
      },
    });

    // Build normalized URL for response
    const normalizedUrl = buildMediaUrl(normalizedStorageUrl, req);
    
    info('SIGNAGE_UPLOAD', 'SignageAsset created', {
      assetId: asset.id,
      type: assetType,
      url: normalizedStorageUrl,
      normalizedUrl,
      tenantId,
      storeId,
    });

    // Build MIEntity for the asset
    const { buildMIEntity } = await import('../mi/buildMIEntity.js');
    const miEntityType = buildMIEntity({
      productId: asset.id,
      productType: assetType === 'video' ? 'video' : 'screen_item',
      fileUrl: normalizedUrl,
      previewUrl: normalizedUrl,
      mediaType: assetType === 'video' ? 'video' : 'image',
      dimensions: width && height ? { width, height } : undefined,
      durationSec: asset.durationS || undefined,
      createdByUserId: req.userId || 'system',
      createdByEngine: 'creative_engine_v3',
      tenantId,
      storeId,
      locales: ['vi-VN', 'en-AU'], // Default locales
    });

    // Register MIEntity in database
    const { registerOrUpdateEntity } = await import('../services/miService.js');
    let miEntityRecord = null;
    try {
      miEntityRecord = await registerOrUpdateEntity({
        productId: miEntityType.productId,
        productType: miEntityType.productType,
        mediaType: miEntityType.format.mediaType,
        fileUrl: miEntityType.format.fileUrl,
        previewUrl: miEntityType.format.previewUrl,
        dimensions: miEntityType.format.dimensions,
        orientation: miEntityType.format.orientation,
        durationSec: miEntityType.format.durationSec,
        createdByUserId: miEntityType.origin.createdByUserId,
        createdByEngine: miEntityType.origin.createdByEngine,
        sourceProjectId: miEntityType.origin.sourceProjectId,
        tenantId: miEntityType.miBrain.context?.tenantId,
        storeId: miEntityType.miBrain.context?.storeId,
        campaignId: miEntityType.miBrain.context?.campaignId,
        miBrain: miEntityType.miBrain,
        status: miEntityType.miBrain.lifecycle?.status || 'active',
        validFrom: miEntityType.miBrain.lifecycle?.validFrom,
        validTo: miEntityType.miBrain.lifecycle?.validTo,
        links: {
          creativeAssetId: asset.id,
        },
      });
    } catch (err) {
      console.warn('[SignageRoutes] Failed to register MIEntity:', err);
      // Non-critical, continue without MIEntity record
    }

    res.status(201).json({
      ok: true,
      asset: {
        id: asset.id,
        url: asset.url, // Keep original for backward compatibility
        normalizedUrl, // Normalized URL for frontend consumption
        type: asset.type,
        name: asset.tags || null,
        mimeType: mime,
        width,
        height,
        durationS: asset.durationS,
        createdAt: asset.createdAt.toISOString(),
      },
      entity: miEntityType, // MIEntity type for Stage 1 (backward compatibility)
      miEntity: miEntityRecord, // Registered MIEntity record
    });
  } catch (err) {
    console.error('[SignageRoutes] Upload asset error:', err);
    res.status(500).json({
      ok: false,
      error: 'internal_error',
      message: err.message || 'Failed to upload asset',
    });
  }
});

// ============================================
// SignageAsset Detail API
// ============================================

/**
 * GET /api/signage-assets/:id
 * Get a single signage asset with MIEntity
 */
router.get('/signage-assets/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { tenantId, storeId } = requireTenantStoreContext(req);

    const asset = await prisma.signageAsset.findFirst({
      where: {
        id,
        tenantId,
        storeId,
      },
    });

    if (!asset) {
      return res.status(404).json({
        ok: false,
        error: 'not_found',
        message: 'Asset not found',
      });
    }

    // Fetch MIEntity if exists
    const { getEntityByLink } = await import('../services/miService.js');
    const miEntity = await getEntityByLink({ creativeAssetId: asset.id });

    // Build normalized URL
    const normalizedUrl = buildMediaUrl(asset.url, req);

    res.json({
      ok: true,
      asset: {
        id: asset.id,
        url: asset.url,
        normalizedUrl,
        type: asset.type,
        name: asset.tags || null,
        durationS: asset.durationS,
        createdAt: asset.createdAt.toISOString(),
      },
      miEntity, // MIEntity record if exists
    });
  } catch (err) {
    console.error('[SignageRoutes] Get asset error:', err);
    res.status(500).json({
      ok: false,
      error: 'internal_error',
      message: err.message || 'Failed to get asset',
    });
  }
});

// ============================================
// SignagePlaylist APIs
// ============================================

/**
 * GET /api/signage-playlists
 * List signage playlists for the current tenant/store
 * 
 * Query params (optional):
 *   - tenantId: string (if not provided, extracted from auth context)
 *   - storeId: string (if not provided, extracted from auth context)
 * 
 * Response:
 *   - ok: true
 *   - items: Array of playlist objects with id, name, description, itemCount, updatedAt, etc.
 */
router.get('/signage-playlists', requireAuth, async (req, res) => {
  try {
    const { tenantId, storeId } = requireTenantStoreContext(req);

    // Log the request for debugging
    console.log('[SignageRoutes] GET /signage-playlists', {
      tenantId,
      storeId,
      userId: req.userId,
      queryParams: req.query,
      hasBusiness: !!req.user?.business,
    });

    // Build where clause - filter by type, tenant, store, and active status
    const where = {
      type: 'SIGNAGE',
      tenantId,
      storeId,
      active: true, // Only return active playlists (matches what POST creates)
    };

    // Query playlists with item counts
    const playlists = await prisma.playlist.findMany({
      where,
      include: {
        items: {
          select: { id: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    console.log('[SignageRoutes] Found playlists', {
      count: playlists.length,
      tenantId,
      storeId,
      playlistIds: playlists.map(p => p.id),
    });

    // Transform to response format
    const items = playlists.map(playlist => {
      // Calculate defaultDurationS from first item if available
      let defaultDurationS = null;
      if (playlist.items && playlist.items.length > 0) {
        // Note: We only selected id above, so we can't get durationS here
        // If needed, we could include durationS in the select, but for now keep it null
        defaultDurationS = null;
      }

      return {
        id: playlist.id,
        name: playlist.name,
        description: playlist.description || null,
        defaultDurationS,
        itemCount: playlist.items.length,
        type: 'SIGNAGE',
        updatedAt: playlist.updatedAt.toISOString(),
        createdAt: playlist.createdAt.toISOString(),
        active: playlist.active,
      };
    });

    res.json({
      ok: true,
      items,
    });
  } catch (err) {
    console.error('[SignageRoutes] List playlists error:', err);
    
    // Handle specific error for missing tenant/store
    if (err.message && err.message.includes('tenantId and storeId are required')) {
      return res.status(400).json({
        ok: false,
        error: 'missing_tenant_store',
        message: 'tenantId and storeId are required. Provide them as query params (?tenantId=...&storeId=...) or ensure your auth context includes business info.',
      });
    }

    res.status(500).json({
      ok: false,
      error: 'internal_error',
      message: err.message || 'Failed to list playlists',
    });
  }
});

/**
 * POST /api/signage-playlists
 * Create a new signage playlist
 * 
 * Request body:
 *   - name: string (required)
 *   - description?: string
 *   - defaultDurationS?: number
 */
router.post('/signage-playlists', requireAuth, async (req, res) => {
  try {
    const { tenantId, storeId } = requireTenantStoreContext(req);

    const { name, description, defaultDurationS } = req.body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({
        ok: false,
        error: 'invalid_name',
        message: 'name is required and must be a non-empty string',
      });
    }

    const playlist = await prisma.playlist.create({
      data: {
        type: 'SIGNAGE',
        name: name.trim(),
        description: description?.trim() || null,
        tenantId,
        storeId,
        active: true,
      },
    });

    res.status(201).json({
      ok: true,
      playlist: {
        id: playlist.id,
        name: playlist.name,
        description: playlist.description || null,
        defaultDurationS: defaultDurationS || null,
        itemCount: 0,
        type: 'SIGNAGE',
        updatedAt: playlist.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    console.error('[SignageRoutes] Create playlist error:', err);
    res.status(500).json({
      ok: false,
      error: 'internal_error',
      message: err.message || 'Failed to create playlist',
    });
  }
});

/**
 * GET /api/signage-playlists/:playlistId
 * Get playlist details with items
 */
router.get('/signage-playlists/:playlistId', requireAuth, async (req, res) => {
  try {
    const { tenantId, storeId } = requireTenantStoreContext(req);
    const { playlistId } = req.params;

    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId },
      include: {
        items: {
          include: { asset: true, media: true },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    if (!playlist) {
      return res.status(404).json({
        ok: false,
        error: 'not_found',
        message: 'Playlist not found',
      });
    }

    // Validate tenant/store access
    if (playlist.tenantId !== tenantId || playlist.storeId !== storeId) {
      return res.status(403).json({
        ok: false,
        error: 'access_denied',
        message: 'Access denied: playlist does not belong to your tenant/store',
      });
    }

    if (playlist.type !== 'SIGNAGE') {
      return res.status(400).json({
        ok: false,
        error: 'invalid_type',
        message: 'This endpoint only supports SIGNAGE playlists',
      });
    }

    const { getEntityByLink } = await import('../services/miService.js');
    const coreBaseUrl = getCoreBaseUrl(req);

    const formatted = await Promise.all(
      playlist.items.map((item) => formatSignagePlaylistItemForApi(item, req, coreBaseUrl, getEntityByLink, null))
    );
    const items = formatted.filter(Boolean);

    const { normalizePlaylistItems: normalizePlaylistItemsNew } = await import('../utils/mediaUrlNormalizer.js');
    const normalizedItems = normalizePlaylistItemsNew(items, coreBaseUrl);

    res.json({
      ok: true,
      playlist: {
        id: playlist.id,
        name: playlist.name,
        description: playlist.description || null,
        defaultDurationS: null, // Playlist model doesn't have this field
        items: normalizedItems,
      },
    });
  } catch (err) {
    console.error('[SignageRoutes] Get playlist error:', err);
    res.status(500).json({
      ok: false,
      error: 'internal_error',
      message: err.message || 'Failed to get playlist',
    });
  }
});

/**
 * PUT /api/signage-playlists/:playlistId
 * Update playlist metadata
 * 
 * Request body:
 *   - name?: string
 *   - description?: string
 *   - defaultDurationS?: number (not stored in Playlist model, but accepted for API consistency)
 */
router.put('/signage-playlists/:playlistId', requireAuth, async (req, res) => {
  try {
    const { tenantId, storeId } = requireTenantStoreContext(req);
    const { playlistId } = req.params;

    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId },
      include: {
        items: {
          include: { asset: true, media: true },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    if (!playlist) {
      return res.status(404).json({
        ok: false,
        error: 'not_found',
        message: 'Playlist not found',
      });
    }

    // Validate access
    if (playlist.tenantId !== tenantId || playlist.storeId !== storeId) {
      return res.status(403).json({
        ok: false,
        error: 'access_denied',
        message: 'Access denied',
      });
    }

    if (playlist.type !== 'SIGNAGE') {
      return res.status(400).json({
        ok: false,
        error: 'invalid_type',
        message: 'This endpoint only supports SIGNAGE playlists',
      });
    }

    // Update fields
    const updateData = {};
    if (req.body.name !== undefined) {
      updateData.name = String(req.body.name).trim();
    }
    if (req.body.description !== undefined) {
      updateData.description = req.body.description ? String(req.body.description).trim() : null;
    }

    const updated = await prisma.playlist.update({
      where: { id: playlistId },
      data: updateData,
      include: {
        items: {
          include: { asset: true, media: true },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    const { getEntityByLink } = await import('../services/miService.js');
    const coreBaseUrlPut = getCoreBaseUrl(req);
    const formattedPutItems = await Promise.all(
      updated.items.map((item) => formatSignagePlaylistItemForApi(item, req, coreBaseUrlPut, getEntityByLink, null))
    );
    const items = formattedPutItems.filter(Boolean);

    res.json({
      ok: true,
      playlist: {
        id: updated.id,
        name: updated.name,
        description: updated.description || null,
        defaultDurationS: null,
        items,
      },
    });
  } catch (err) {
    console.error('[SignageRoutes] Update playlist error:', err);
    res.status(500).json({
      ok: false,
      error: 'internal_error',
      message: err.message || 'Failed to update playlist',
    });
  }
});

/**
 * DELETE /api/signage-playlists/:playlistId
 * Delete a playlist (hard delete)
 */
router.delete('/signage-playlists/:playlistId', requireAuth, async (req, res) => {
  try {
    const { playlistId } = req.params;
    console.log(`[SignageRoutes] DELETE /signage-playlists/:playlistId id=${playlistId}`);

    let tenantId, storeId;
    try {
      const context = requireTenantStoreContext(req);
      tenantId = context.tenantId;
      storeId = context.storeId;
    } catch (contextError) {
      console.error('[SignageRoutes] Failed to get tenant/store context:', contextError.message);
      return res.status(400).json({
        ok: false,
        error: 'invalid_request',
        message: contextError.message || 'tenantId and storeId are required',
      });
    }

    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId },
    });

    if (!playlist) {
      console.log(`[SignageRoutes] DELETE /signage-playlists/:playlistId id=${playlistId} → 404 not found`);
      return res.status(404).json({
        ok: false,
        error: 'not_found',
        message: 'Playlist not found',
      });
    }

    // Validate access
    if (playlist.tenantId !== tenantId || playlist.storeId !== storeId) {
      console.log(`[SignageRoutes] DELETE /signage-playlists/:playlistId id=${playlistId} → 403 access denied`);
      return res.status(403).json({
        ok: false,
        error: 'access_denied',
        message: 'Access denied',
      });
    }

    // Get all playlist items before deletion to clean up MIEntity records
    const playlistItems = await prisma.playlistItem.findMany({
      where: { playlistId },
      select: { id: true },
    });

    // Delete associated MIEntity records (non-blocking)
    if (playlistItems.length > 0) {
      try {
        const { deleteEntity } = await import('../services/miService.js');
        const { getEntityByLink } = await import('../services/miService.js');
        
        await Promise.all(
          playlistItems.map(async (item) => {
            try {
              const miEntity = await getEntityByLink({ screenItemId: item.id });
              if (miEntity) {
                await deleteEntity(miEntity.id);
              }
            } catch (err) {
              // Non-critical, log and continue
              console.warn(`[SignageRoutes] Failed to delete MIEntity for item ${item.id}:`, err.message);
            }
          })
        );
      } catch (err) {
        // Non-critical error, log but continue with playlist deletion
        console.warn('[SignageRoutes] Failed to clean up MIEntity records:', err.message);
      }
    }

    // Delete playlist (cascade will delete items)
    await prisma.playlist.delete({
      where: { id: playlistId },
    });

    console.log(`[SignageRoutes] DELETE /signage-playlists/:playlistId id=${playlistId} → ok`);
    res.json({
      ok: true,
    });
  } catch (err) {
    console.error('[SignageRoutes] Delete playlist error:', err);
    console.error('[SignageRoutes] Delete playlist error details:', {
      code: err?.code,
      message: err?.message,
      stack: err?.stack,
    });
    
    // Handle Prisma "record not found" error
    if (err?.code === 'P2025') {
      return res.status(404).json({
        ok: false,
        error: 'not_found',
        message: 'Playlist not found',
      });
    }
    
    res.status(500).json({
      ok: false,
      error: 'internal_error',
      message: err.message || 'Failed to delete playlist',
    });
  }
});

// ============================================
// PlaylistItem Management APIs
// ============================================

/**
 * POST /api/signage-playlists/:playlistId/items
 * Add assets to playlist
 * 
 * Request body:
 *   - assetIds: string[] (required)
 */
router.post('/signage-playlists/:playlistId/items', requireAuth, async (req, res) => {
  try {
    const { tenantId, storeId } = requireTenantStoreContext(req);
    const { playlistId } = req.params;
    const { assetIds } = req.body;

    if (!Array.isArray(assetIds) || assetIds.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_assetIds',
        message: 'assetIds must be a non-empty array',
      });
    }

    // Verify playlist exists and belongs to tenant/store
    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId },
    });

    if (!playlist) {
      return res.status(404).json({
        ok: false,
        error: 'not_found',
        message: 'Playlist not found',
      });
    }

    if (playlist.tenantId !== tenantId || playlist.storeId !== storeId) {
      return res.status(403).json({
        ok: false,
        error: 'access_denied',
        message: 'Access denied',
      });
    }

    // Verify all assets exist and belong to tenant/store
    const assets = await prisma.signageAsset.findMany({
      where: {
        id: { in: assetIds },
        tenantId,
        storeId,
      },
    });

    if (assets.length !== assetIds.length) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_assets',
        message: 'One or more assets not found or do not belong to your tenant/store',
      });
    }

    // Get current max orderIndex
    const maxItem = await prisma.playlistItem.findFirst({
      where: { playlistId },
      orderBy: { orderIndex: 'desc' },
      select: { orderIndex: true },
    });

    const startOrderIndex = maxItem ? maxItem.orderIndex + 1 : 0;

    // Get default duration from playlist (use first item's duration or default to 8)
    const firstItem = await prisma.playlistItem.findFirst({
      where: { playlistId },
      select: { durationS: true },
    });
    const defaultDurationS = firstItem?.durationS || 8;

    // Create playlist items (validated SignageAsset FK above)
    const items = await Promise.all(
      assetIds.map((assetId, index) => {
        console.log('[PlaylistItem] creating with mediaId:', null, 'assetId:', assetId);
        return prisma.playlistItem.create({
          data: {
            playlistId,
            assetId,
            orderIndex: startOrderIndex + index,
            durationS: defaultDurationS,
          },
          include: {
            asset: true,
          },
        });
      })
    );

    // Register MIEntity for each playlist item (non-blocking)
    const userId = req.userId || null;
    await Promise.all(
      items.map(item => 
        registerPlaylistItemMIEntity(item, item.asset, playlist, userId)
          .catch(err => {
            console.warn(`[SignageRoutes] Failed to register MIEntity for item ${item.id}:`, err.message);
          })
      )
    );

    // Format response
    const formattedItems = items.map(item => ({
      id: item.id,
      assetId: item.assetId || '',
      orderIndex: item.orderIndex,
      durationS: item.durationS,
      asset: item.asset ? {
        id: item.asset.id,
        url: item.asset.url,
        type: item.asset.type,
        name: item.asset.tags || null,
        mimeType: null,
        width: null,
        height: null,
        durationS: item.asset.durationS || null,
        createdAt: item.asset.createdAt.toISOString(),
      } : null,
    }));

    res.status(201).json({
      ok: true,
      items: formattedItems,
    });
  } catch (err) {
    console.error('[SignageRoutes] Add items error:', err);
    res.status(500).json({
      ok: false,
      error: 'internal_error',
      message: err.message || 'Failed to add items',
    });
  }
});

/**
 * PUT /api/signage-playlists/:playlistId/items/:itemId
 * Update playlist item
 * 
 * Request body:
 *   - durationS?: number
 *   - orderIndex?: number
 */
router.put('/signage-playlists/:playlistId/items/:itemId', requireAuth, async (req, res) => {
  try {
    const { tenantId, storeId } = requireTenantStoreContext(req);
    const { playlistId, itemId } = req.params;

    // Verify playlist belongs to tenant/store
    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId },
    });

    if (!playlist) {
      return res.status(404).json({
        ok: false,
        error: 'not_found',
        message: 'Playlist not found',
      });
    }

    if (playlist.tenantId !== tenantId || playlist.storeId !== storeId) {
      return res.status(403).json({
        ok: false,
        error: 'access_denied',
        message: 'Access denied',
      });
    }

    // Get item
    const item = await prisma.playlistItem.findUnique({
      where: { id: itemId },
      include: { asset: true },
    });

    if (!item || item.playlistId !== playlistId) {
      return res.status(404).json({
        ok: false,
        error: 'not_found',
        message: 'Item not found',
      });
    }

    // Update fields
    const updateData = {};
    if (req.body.durationS !== undefined) {
      updateData.durationS = Number(req.body.durationS);
    }

    // Handle orderIndex change (requires reordering)
    if (req.body.orderIndex !== undefined) {
      const newOrderIndex = Number(req.body.orderIndex);
      const oldOrderIndex = item.orderIndex;

      if (newOrderIndex !== oldOrderIndex) {
        // Get all items
        const allItems = await prisma.playlistItem.findMany({
          where: { playlistId },
          orderBy: { orderIndex: 'asc' },
        });

        // Remove item from old position and insert at new position
        const itemsWithoutCurrent = allItems.filter(i => i.id !== itemId);
        itemsWithoutCurrent.splice(newOrderIndex, 0, { ...item, orderIndex: newOrderIndex });

        // Re-normalize order indices
        await Promise.all(
          itemsWithoutCurrent.map((i, idx) =>
            prisma.playlistItem.update({
              where: { id: i.id },
              data: { orderIndex: idx },
            })
          )
        );
      }
    }

    // Update item if durationS changed
    if (Object.keys(updateData).length > 0) {
      await prisma.playlistItem.update({
        where: { id: itemId },
        data: updateData,
      });
    }

    // Fetch updated item
    const updatedItem = await prisma.playlistItem.findUnique({
      where: { id: itemId },
      include: { asset: true },
    });

    // Register or update MIEntity for the updated playlist item (non-blocking)
    const userId = req.userId || null;
    await registerPlaylistItemMIEntity(updatedItem, updatedItem.asset, playlist, userId)
      .catch(err => {
        console.warn(`[SignageRoutes] Failed to register MIEntity for updated item ${itemId}:`, err.message);
      });

    res.json({
      ok: true,
      item: {
        id: updatedItem.id,
        assetId: updatedItem.assetId || '',
        orderIndex: updatedItem.orderIndex,
        durationS: updatedItem.durationS,
        asset: updatedItem.asset ? {
          id: updatedItem.asset.id,
          url: updatedItem.asset.url,
          type: updatedItem.asset.type,
          name: updatedItem.asset.tags || null,
          mimeType: null,
          width: null,
          height: null,
          durationS: updatedItem.asset.durationS || null,
          createdAt: updatedItem.asset.createdAt.toISOString(),
        } : null,
      },
    });
  } catch (err) {
    console.error('[SignageRoutes] Update item error:', err);
    res.status(500).json({
      ok: false,
      error: 'internal_error',
      message: err.message || 'Failed to update item',
    });
  }
});

/**
 * PUT /api/signage-playlists/:playlistId/items/reorder
 * Bulk reorder playlist items
 * 
 * Request body:
 *   - order: string[] (array of itemIds in desired order)
 */
router.put('/signage-playlists/:playlistId/items/reorder', requireAuth, async (req, res) => {
  try {
    const { tenantId, storeId } = requireTenantStoreContext(req);
    const { playlistId } = req.params;
    const { order } = req.body;

    if (!Array.isArray(order)) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_order',
        message: 'order must be an array of itemIds',
      });
    }

    // Verify playlist belongs to tenant/store
    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId },
    });

    if (!playlist) {
      return res.status(404).json({
        ok: false,
        error: 'not_found',
        message: 'Playlist not found',
      });
    }

    if (playlist.tenantId !== tenantId || playlist.storeId !== storeId) {
      return res.status(403).json({
        ok: false,
        error: 'access_denied',
        message: 'Access denied',
      });
    }

    // Verify all items belong to this playlist
    const items = await prisma.playlistItem.findMany({
      where: {
        id: { in: order },
        playlistId,
      },
    });

    if (items.length !== order.length) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_items',
        message: 'One or more items not found or do not belong to this playlist',
      });
    }

    // Update order indices
    await Promise.all(
      order.map((itemId, index) =>
        prisma.playlistItem.update({
          where: { id: itemId },
          data: { orderIndex: index },
        })
      )
    );

    res.json({
      ok: true,
    });
  } catch (err) {
    console.error('[SignageRoutes] Reorder items error:', err);
    res.status(500).json({
      ok: false,
      error: 'internal_error',
      message: err.message || 'Failed to reorder items',
    });
  }
});

/**
 * DELETE /api/signage-playlists/:playlistId/items/:itemId
 * Delete a playlist item
 */
router.delete('/signage-playlists/:playlistId/items/:itemId', requireAuth, async (req, res) => {
  try {
    const { tenantId, storeId } = requireTenantStoreContext(req);
    const { playlistId, itemId } = req.params;

    // Verify playlist belongs to tenant/store
    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId },
    });

    if (!playlist) {
      return res.status(404).json({
        ok: false,
        error: 'not_found',
        message: 'Playlist not found',
      });
    }

    if (playlist.tenantId !== tenantId || playlist.storeId !== storeId) {
      return res.status(403).json({
        ok: false,
        error: 'access_denied',
        message: 'Access denied',
      });
    }

    // Verify item belongs to playlist
    const item = await prisma.playlistItem.findUnique({
      where: { id: itemId },
    });

    if (!item || item.playlistId !== playlistId) {
      return res.status(404).json({
        ok: false,
        error: 'not_found',
        message: 'Item not found',
      });
    }

    // Delete item
    await prisma.playlistItem.delete({
      where: { id: itemId },
    });

    // Re-normalize order indices for remaining items
    const remainingItems = await prisma.playlistItem.findMany({
      where: { playlistId },
      orderBy: { orderIndex: 'asc' },
    });

    await Promise.all(
      remainingItems.map((i, index) =>
        prisma.playlistItem.update({
          where: { id: i.id },
          data: { orderIndex: index },
        })
      )
    );

    res.json({
      ok: true,
    });
  } catch (err) {
    console.error('[SignageRoutes] Delete item error:', err);
    res.status(500).json({
      ok: false,
      error: 'internal_error',
      message: err.message || 'Failed to delete item',
    });
  }
});

/**
 * GET /api/signage/playlist/:playlistId
 * Get single playlist with items and assigned devices
 * 
 * Query params:
 *   - storeId: string (required)
 *   - tenantId: string (required)
 * 
 * Response:
 *   {
 *     ok: true,
 *     playlist: {
 *       id: string,
 *       name: string,
 *       description: string | null,
 *       defaultDurationS: number | null,
 *       items: Array<{
 *         id: string,
 *         assetId: string,
 *         orderIndex: number,
 *         durationS: number,
 *         asset: SignageAssetSummary
 *       }>,
 *       assignedDevices: Array<{
 *         deviceId: string,
 *         deviceName: string | null,
 *         status: string,
 *         bindingStatus: string
 *       }>
 *     }
 *   }
 */
router.get('/signage/playlist/:playlistId', requireAuth, async (req, res) => {
  try {
    const { tenantId, storeId } = requireTenantStoreContext(req);
    const { playlistId } = req.params;

    // Fetch playlist with items (asset and/or media FK)
    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId },
      include: {
        items: {
          include: { asset: true, media: true },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    if (!playlist) {
      return res.status(404).json({
        ok: false,
        error: 'not_found',
        message: 'Playlist not found',
      });
    }

    // Validate tenant/store access
    if (playlist.tenantId !== tenantId || playlist.storeId !== storeId) {
      return res.status(403).json({
        ok: false,
        error: 'access_denied',
        message: 'Access denied: playlist does not belong to your tenant/store',
      });
    }

    if (playlist.type !== 'SIGNAGE') {
      return res.status(400).json({
        ok: false,
        error: 'invalid_type',
        message: 'This endpoint only supports SIGNAGE playlists',
      });
    }

    // Fetch assigned devices (via DevicePlaylistBinding)
    const bindings = await prisma.devicePlaylistBinding.findMany({
      where: {
        playlistId: playlist.id,
      },
      include: {
        device: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
      },
    });

    const lang = req.query.lang || extractLanguageFromHeader(req.get('Accept-Language'));

    const { getEntityByLink } = await import('../services/miService.js');
    const coreBaseUrlLegacy = getCoreBaseUrl(req);
    const itemPayloads = await Promise.all(
      playlist.items.map((item) =>
        formatSignagePlaylistItemForApi(item, req, coreBaseUrlLegacy, getEntityByLink, lang)
      )
    );
    const items = itemPayloads.filter(Boolean);

    // Format assigned devices
    const assignedDevices = bindings.map(binding => ({
      deviceId: binding.device.id,
      deviceName: binding.device.name || null,
      status: binding.device.status || 'offline',
      bindingStatus: binding.status || 'pending',
    }));

    // Use translation utilities for playlist name and description
    const playlistName = getTranslatedField(playlist, 'name', lang) || playlist.name;
    const playlistDescription = getTranslatedField(playlist, 'description', lang) ?? playlist.description ?? null;

    res.json({
      ok: true,
      playlist: {
        id: playlist.id,
        name: playlistName,
        description: playlistDescription,
        defaultDurationS: null, // Playlist model doesn't have this field
        items,
        assignedDevices,
      },
    });
  } catch (err) {
    // Handle requireTenantStoreContext errors
    if (err.message && err.message.includes('tenantId and storeId are required')) {
      return res.status(400).json({
        ok: false,
        error: 'missing_tenant_store',
        message: err.message,
      });
    }

    console.error('[SignageRoutes] Get playlist error:', err);
    res.status(500).json({
      ok: false,
      error: 'internal_error',
      message: err.message || 'Failed to get playlist',
    });
  }
});

export default router;

