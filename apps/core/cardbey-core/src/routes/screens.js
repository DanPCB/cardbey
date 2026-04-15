// src/routes/screens.js
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { broadcast } from '../realtime/sse.js';
import path from 'path';
// Use database-backed session store (canonical source of truth)
import {
  createPairSession,
  findByCode,
  getPairSession,
  expireSessions,
  updatePairSession,
  getAllActiveSessions,
  getActiveSessionCount,
} from '../pair/dbSessionStore.js';
import { deleteScreen } from '../screens/deleteScreen.js';
import { getScreenOr404 } from '../screens/getScreen.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { logger } from '../utils/logger.js';
import {
  recordInitiate,
  recordPeek,
  recordRegister,
  recordComplete,
} from '../debug/pairingStats.js';
import { resolvePublicUrl, fileExistsOnDisk, isCloudFrontUrl } from '../utils/publicUrl.js';
import { getCoreBaseUrl, normalizePlaylistItems } from '../utils/normalizeMediaUrl.js';
import { info, warn, debug } from '../lib/logger.js';
import { getCachedPlaylist, setCachedPlaylist } from '../lib/playlistCache.js';
import { requireAuth, requireStoreAccess, optionalAuth } from '../middleware/auth.js';

const prisma = new PrismaClient();
const router = Router();

// GET /api/screens - List screens with optional stats
// Query params: limit, offset, q (search), stats=1
// Response: { ok: true, items: [...], total: number, stats?: {...} }
router.get('/screens', async (req, res, next) => {
  try {
    const includeDeleted = req.query.includeDeleted === '1' || req.query.includeDeleted === 'true';
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;
    const q = req.query.q ? String(req.query.q).trim() : null;
    const includeStats = req.query.stats === '1' || req.query.stats === 'true';

    const where = includeDeleted ? {} : { deletedAt: null };

    // Add search filter if provided
    if (q) {
      where.OR = [
        { name: { contains: q } },
        { location: { contains: q } },
        { fingerprint: { contains: q } },
      ];
    }

    // Get total count
    const total = await prisma.screen.count({ where });

    // Get screens with pagination
    const screens = await prisma.screen.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: limit,
      skip: offset,
    });

    const response = {
      ok: true,
      items: screens,
      total,
    };

    // Add stats if requested
    if (includeStats) {
      const statsWhere = { deletedAt: null };
      
      const [totalScreens, onlineScreens, offlineScreens, playlistCount] = await Promise.all([
        prisma.screen.count({ where: statsWhere }),
        prisma.screen.count({
          where: {
            ...statsWhere,
            status: 'ONLINE',
          },
        }),
        prisma.screen.count({
          where: {
            ...statsWhere,
            status: 'OFFLINE',
          },
        }),
        prisma.playlist.count({}), // Count all playlists (adjust if tenant-scoped)
      ]);

      response.stats = {
        totalScreens,
        onlineScreens,
        offlineScreens,
        playlists: playlistCount,
      };
    }

    return res.json(response);
  } catch (error) {
    return next(error);
  }
});

// GET /api/screens/:id/playlist - Get playlist assigned to screen
// OpenAPI: GET /api/screens/{id}/playlist
// Response: { ok: true, screenId, playlistId, playlist | null }
// Returns 200 with playlist:null if no playlist assigned (not 404)
router.get('/screens/:id/playlist', async (req, res, next) => {
  const requestId = req.requestId;
  
  // Log playlist request
  info('PLAYLIST', 'Building playlist for screen', {
    screenId: req.params.id,
    full: false,
    requestId,
    userAgent: req.get('user-agent'),
    ip: req.ip,
  });
  try {
    const { id } = req.params;
    const screen = await getScreenOr404(prisma, id, { includeDeleted: false });

    if (!screen) {
      return res.status(404).json({ ok: false, error: 'screen_not_found' });
    }

    const screenWithPlaylist = await prisma.screen.findUnique({
      where: { id: screen.id },
      include: { assignedPlaylist: true },
    });

    const playlistObj = screenWithPlaylist?.assignedPlaylist
      ? { id: screenWithPlaylist.assignedPlaylist.id, name: screenWithPlaylist.assignedPlaylist.name }
      : null;

    const response = {
      ok: true,
      screenId: id,
      playlistId: screenWithPlaylist?.assignedPlaylist?.id ?? null,
      playlist: playlistObj,
    };
    
    // Cache the response
    setCachedPlaylist(id, { full: false }, response);
    
    // Light debug log
    logger.info('[PLAYLIST] get screen playlist (basic)', {
      screenId: id,
      playlistId: response.playlistId,
    });
    return res.json(response);
  } catch (error) {
    return next (error);
  }
});

// GET /api/screens/:id/playlist/full - Flattened, playable items for device/preview
// Query param: includeMissing=true (optional) - Include missing files in response for editor UI
// Response:
// { ok: true, screenId, playlistId, items: [{ type: 'video'|'image', url, durationS, muted, loop, status? }] }
router.get('/screens/:id/playlist/full', 
  rateLimit({ windowMs: 10 * 1000, max: 30 }), // Max 30 requests per 10 seconds per IP (increased for TV polling)
  async (req, res, next) => {
  const requestStartTime = Date.now();
  const requestId = req.requestId || Math.random().toString(36).slice(2, 9);
  
  try {
    const { id } = req.params;
    
    // Check cache first
    const cached = getCachedPlaylist(id, { full: true });
    if (cached) {
      debug('PLAYLIST', 'Served playlist from cache', {
        screenId: id,
        full: true,
        requestId,
      });
      return res.json(cached);
    }
    
    // Log playlist request
    info('PLAYLIST', 'Building playlist for screen', {
      screenId: id,
      full: true,
      requestId,
      userAgent: req.get('user-agent'),
      ip: req.ip,
    });
    
    // Check if screen exists (including soft-deleted) for better error message
    const screenExists = await prisma.screen.findUnique({
      where: { id },
      select: { id: true, deletedAt: true, status: true },
    });
    
    if (!screenExists) {
      console.log(`[PLAYLIST] [${requestId}] Screen does not exist in database: ${id}`);
      return res.status(404).json({ ok: false, error: 'screen_not_found', message: 'Screen does not exist' });
    }
    
    if (screenExists.deletedAt) {
      console.log(`[PLAYLIST] [${requestId}] Screen is soft-deleted: ${id}, deletedAt: ${screenExists.deletedAt}`);
      return res.status(404).json({ 
        ok: false, 
        error: 'screen_not_found', 
        message: 'Screen has been deleted',
        deleted: true 
      });
    }
    
    const screen = await getScreenOr404(prisma, id, { includeDeleted: false });
    if (!screen) {
      console.log(`[PLAYLIST] [${requestId}] Screen not found after second check: ${id}`);
      return res.status(404).json({ ok: false, error: 'screen_not_found' });
    }
    console.log(`[PLAYLIST] [${requestId}] Screen found, fetching playlist...`);

    const screenWithPlaylist = await prisma.screen.findUnique({
      where: { id: screen.id },
      include: {
        assignedPlaylist: {
          include: {
            items: {
              include: { media: true },
              orderBy: { orderIndex: 'asc' },
            }
          }
        }
      }
    });
    console.log(`[PLAYLIST] [${requestId}] Playlist fetched, processing items...`);
    
    // Enhanced logging for debugging empty playlists
    const rawItems = screenWithPlaylist?.assignedPlaylist?.items || [];
    console.log(`[PLAYLIST] [${requestId}] Raw playlist items count: ${rawItems.length}`);
    if (rawItems.length > 0) {
      console.log(`[PLAYLIST] [${requestId}] First item sample:`, {
        itemId: rawItems[0].id,
        mediaId: rawItems[0].mediaId,
        hasMedia: !!rawItems[0].media,
        mediaUrl: rawItems[0].media?.url || 'NO URL',
        mediaKind: rawItems[0].media?.kind || 'UNKNOWN',
      });
    }

    const playlistId = screenWithPlaylist?.assignedPlaylist?.id || null;
    const includeMissing = req.query.includeMissing === 'true' || req.query.includeMissing === '1';
    
    const items = (screenWithPlaylist?.assignedPlaylist?.items || [])
      // Check items - for CloudFront/S3 URLs, trust the URL and skip filesystem checks
      // For legacy local files, always verify existence to catch files that are actually missing
      .filter((it) => {
        const media = it.media || {};
        const mediaUrl = media.url || '';
        
        // Enhanced logging for items without URLs
        if (!mediaUrl || mediaUrl.trim() === '') {
          console.warn(`[PLAYLIST] [${requestId}] Item ${it.id} has no media URL:`, {
            itemId: it.id,
            mediaId: it.mediaId,
            hasMedia: !!it.media,
            mediaIdInItem: it.mediaId,
            mediaObject: it.media ? { id: it.media.id, kind: it.media.kind } : null,
          });
        }
        
        // Skip filesystem checks for CloudFront/S3 URLs - they're always available
        if (isCloudFrontUrl(mediaUrl) || (media.optimizedUrl && isCloudFrontUrl(media.optimizedUrl))) {
          // CloudFront URL - clear missingFile flag if set (legacy flag)
          if (media.missingFile === true && media.id) {
            prisma.media.update({
              where: { id: media.id },
              data: { missingFile: false },
            }).catch(() => {});
          }
          return true; // Always include CloudFront URLs
        }
        
        // Local file (relative path or absolute localhost URL) - check filesystem existence
        // Don't trust DB flag alone - verify actual file existence
        const kind = (media.kind || 'IMAGE').toLowerCase();
        
        // If no URL at all, skip this item
        if (!mediaUrl || mediaUrl.trim() === '') {
          warn('PLAYLIST', 'Skipping playlist item - no URL', {
            screenId: id,
            playlistItemId: it.id || 'unknown',
            mediaId: media.id || 'unknown',
            reason: 'missing_url',
            requestId,
          });
          return includeMissing; // Include only if explicitly requested
        }
        
        let fileExists = false;
        let checkedPath = '';
        
        // For videos, check optimized URL first, then fallback to original
        if (kind === 'video' && media.optimizedUrl) {
          checkedPath = media.optimizedUrl;
          fileExists = fileExistsOnDisk(media.optimizedUrl);
          if (!fileExists) {
            checkedPath = mediaUrl;
            fileExists = fileExistsOnDisk(mediaUrl);
          }
        } else {
          // For images or videos without optimized URL, check original URL
          checkedPath = mediaUrl;
          fileExists = fileExistsOnDisk(mediaUrl);
        }
        
        // Log detailed info if file doesn't exist (for debugging)
        if (!fileExists && !includeMissing) {
          debug('PLAYLIST', 'File check result', {
            screenId: id,
            playlistItemId: it.id || 'unknown',
            mediaId: media.id || 'unknown',
            checkedPath,
            mediaUrl,
            optimizedUrl: media.optimizedUrl || 'none',
            kind,
            requestId,
          });
        }
        
        if (fileExists) {
          // File exists - update DB flag if it was incorrectly marked as missing
          if (media.missingFile === true && media.id) {
            prisma.media.update({
              where: { id: media.id },
              data: { missingFile: false },
            }).catch(() => {});
          }
          return true;
        } else {
          // File is actually missing - update DB flag and skip unless includeMissing=true
          if (media.id) {
            prisma.media.update({
              where: { id: media.id },
              data: { missingFile: true },
            }).catch(() => {});
          }
          
          if (!includeMissing) {
            warn('PLAYLIST', 'Skipping playlist item', {
              screenId: id,
              playlistItemId: it.id || 'unknown',
              mediaId: media.id || 'unknown',
              reason: 'file_not_found',
              path: checkedPath,
              mediaUrl: mediaUrl,
              optimizedUrl: media.optimizedUrl || 'none',
              requestId,
            });
            return false;
          }
          return true; // Include if includeMissing=true (for editor UI)
        }
      })
      .map((it) => {
      const media = it.media || {};
      const kind = (media.kind || 'IMAGE').toLowerCase();
      
      // Prefer optimizedUrl for videos if available and optimized, fallback to original
      // Always prefer optimizedUrl if isOptimized=true, otherwise use original
      let rawUrl;
      const originalUrl = media.url || it.url || it.src || it.mediaUrl || '';
      let fileStatus = 'OK';
      
      // Check if URLs are CloudFront (new) or local (legacy)
      const isOriginalCloudFront = isCloudFrontUrl(originalUrl);
      const isOptimizedCloudFront = media.optimizedUrl && isCloudFrontUrl(media.optimizedUrl);
      
      if (kind === 'video') {
        // Use optimized URL if available and optimization is complete
        if (media.optimizedUrl && media.isOptimized === true) {
          if (isOptimizedCloudFront) {
            // CloudFront optimized URL - use it directly
            rawUrl = media.optimizedUrl;
            console.log(`[PLAYLIST] Using optimized video for asset ${media.id || 'unknown'}`);
          } else if (fileExistsOnDisk(media.optimizedUrl)) {
            // Legacy local optimized file exists - use it
            rawUrl = media.optimizedUrl;
            console.log(`[PLAYLIST] Using optimized video for asset ${media.id || 'unknown'}`);
          } else {
            // Optimized URL set but file missing - fallback to original
            console.warn(`[PLAYLIST] Optimized video missing, falling back to original for asset ${media.id || 'unknown'}`);
            rawUrl = originalUrl;
          }
        } else if (media.optimizedUrl) {
          // optimizedUrl exists but isOptimized=false (optimization in progress or failed)
          console.log(`[PLAYLIST] Using original video for asset ${media.id || 'unknown'} (optimization pending)`);
          rawUrl = originalUrl;
        } else {
          // No optimized URL yet
          rawUrl = originalUrl;
          if (kind === 'video') {
            console.log(`[PLAYLIST] Using original video for asset ${media.id || 'unknown'} (no optimized version)`);
          }
        }
      } else {
        // Images - always use original
        rawUrl = originalUrl;
      }
      
      // File existence was already verified in the filter above
      // Set status based on whether this is CloudFront (always OK) or local file (already verified)
      if (isCloudFrontUrl(rawUrl)) {
        fileStatus = 'OK'; // CloudFront URLs are always available
      } else if (rawUrl && fileExistsOnDisk(rawUrl)) {
        fileStatus = 'OK'; // Local file exists
      } else {
        // Edge case: rawUrl was selected but doesn't exist (e.g., optimized URL selected but file missing)
        // This shouldn't happen often since filter checked, but handle gracefully
        fileStatus = 'MISSING_FILE';
        console.warn('[PLAYLIST] ⚠️ Selected URL missing:', {
          screenId: id,
          playlistId,
          mediaId: media.id || 'unknown',
          path: rawUrl,
          originalUrl: originalUrl,
          optimizedUrl: media.optimizedUrl || 'none',
        });
        
        if (media.id) {
          prisma.media.update({
            where: { id: media.id },
            data: { missingFile: true },
          }).catch(() => {});
        }
      }
      
      // CloudFront URLs are already absolute; legacy local paths need resolution
      let url = isCloudFrontUrl(rawUrl) ? rawUrl : resolvePublicUrl(rawUrl, req);
      
      // Infer mimeType - ensure videos use video/mp4
      let mimeType = media.mime || '';
      if (!mimeType && url) {
        const ext = path.extname(url).toLowerCase();
        if (ext === '.mp4') mimeType = 'video/mp4';
        else if (ext === '.webm') mimeType = 'video/webm';
        else if (ext === '.mov') mimeType = 'video/quicktime';
        else if (ext === '.m3u8') mimeType = 'application/vnd.apple.mpegurl';
        else if (ext === '.mpd') mimeType = 'application/dash+xml';
        else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
        else if (ext === '.png') mimeType = 'image/png';
        else if (ext === '.gif') mimeType = 'image/gif';
      }
      
      // For videos, ensure mimeType is video/mp4 (standard for streaming)
      if (kind === 'video' && !mimeType) {
        mimeType = 'video/mp4';
      }
      
      const item = {
        type: kind === 'video' ? 'video' : 'image',
        url,
        mimeType: mimeType || (kind === 'video' ? 'video/mp4' : undefined),
        durationS: Number(it.durationS || 8),
        muted: Boolean(it.muted ?? true),
        loop: Boolean(it.loop ?? false),
        fit: it.fit || 'cover',
        displayOrientation: it.displayOrientation || 'AUTO', // Display orientation for video playback
        // Add status flag for missing files so UI can handle them appropriately
        status: fileStatus,
      };
      return item;
    })
    .filter(x => x.url) // Must have a URL
    .filter(x => {
      // Exclude missing files unless explicitly requested (for editor UI)
      if (x.status === 'MISSING_FILE' && !includeMissing) {
        return false;
      }
      return true;
    });

    // Count items by type and optimization status
    const videoCount = items.filter(item => item.type === 'video').length;
    const imageCount = items.filter(item => item.type === 'image').length;
    const usingOptimizedCount = items.filter(item => {
      const playlistItem = screenWithPlaylist?.assignedPlaylist?.items?.find(it => {
        const media = it.media || {};
        const itemUrl = item.url;
        return media.optimizedUrl && itemUrl && itemUrl.includes(media.optimizedUrl.split('/').pop());
      });
      return playlistItem?.media?.isOptimized === true;
    }).length;
    const usingOriginalCount = items.length - usingOptimizedCount;
    
    // Check for missing files that were filtered out
    const totalItems = screenWithPlaylist?.assignedPlaylist?.items?.length || 0;
    const missingItemsCount = totalItems - items.length;
    
    // Log playlist built
    info('PLAYLIST', 'Playlist built', {
      screenId: id,
      playlistId,
      itemCount: items.length,
      videoCount,
      imageCount,
      usingOptimizedCount,
      usingOriginalCount,
      missingItemsFiltered: missingItemsCount,
      requestId,
    });
    
    // Warn if playlist is empty (indicates APK bug or missing playlist)
    if (items.length === 0) {
      console.error('[PLAYLIST] WARNING: Empty playlist returned for screen', id);
      console.error('[PLAYLIST] Request URL:', req.originalUrl);
      console.error('[PLAYLIST] Screen has playlist:', !!screenWithPlaylist?.assignedPlaylist);
      console.error('[PLAYLIST] Playlist ID:', screenWithPlaylist?.assignedPlaylist?.id || 'none');
      console.error('[PLAYLIST] Total playlist items:', totalItems);
      console.error('[PLAYLIST] Missing files filtered out:', missingItemsCount);
      
      if (missingItemsCount > 0) {
        console.error('[PLAYLIST] ⚠️ All items are missing files - playlist is empty due to missing media');
        console.error('[PLAYLIST] 💡 Suggestion: Run scanner (npm run scan:missing-media) or check media files on disk');
      }
    } else if (missingItemsCount > 0) {
      console.warn(`[PLAYLIST] ⚠️ ${missingItemsCount} missing file(s) filtered out from playlist (${items.length} playable items remaining)`);
    }
    
    // Log items (but limit JSON size to prevent hanging on large playlists)
    try {
      const itemSummary = items.slice(0, 10).map(item => ({
        type: item.type,
        url: item.url?.substring(0, 100) || '', // Truncate long URLs
        status: item.status || 'OK',
      }));
      console.log(`[PLAYLIST] [${requestId}] Screen ${id} items (showing first 10):`, JSON.stringify(itemSummary));
      if (items.length > 10) {
        console.log(`[PLAYLIST] [${requestId}] ... and ${items.length - 10} more items`);
      }
    } catch (logError) {
      console.warn(`[PLAYLIST] [${requestId}] Failed to log items:`, logError.message);
    }

    // Log summary for debugging playback
    try {
      logger.info('[PLAYLIST] get screen playlist (full)', {
        screenId: id,
        assignedPlaylistId: playlistId,
        itemCount: items.length
      });
    } catch {}

    // Cache the response
    const responseData = {
      ok: true,
      screenId: id,
      playlistId,
      items,
      metadata: {
        totalItems: items.length,
        missingItemsFiltered: missingItemsCount,
      },
    };
    
    setCachedPlaylist(id, { full: true }, responseData);
    
    // Add cache headers to reduce unnecessary requests
    // Short cache (5 seconds) to balance freshness and performance
    res.setHeader('Cache-Control', 'private, max-age=5, must-revalidate');
    res.setHeader('ETag', `"${playlistId || 'none'}-${screenWithPlaylist?.assignedPlaylist?.updatedAt || '0'}"`);

    const duration = Date.now() - requestStartTime;
    console.log(`[PLAYLIST] [${requestId}] Sending response (${duration}ms): screenId=${id}, items=${items.length}`);
    
    // Include metadata about missing files if any were filtered (reuse totalItems from above)
    
    const response = {
      ok: true,
      screenId: id,
      playlistId,
      items,
      // Include metadata for frontend when missing files are filtered
      ...(missingItemsCount > 0 && !includeMissing && {
        metadata: {
          totalItems,
          playableItems: items.length,
          missingItems: missingItemsCount,
          hint: 'Some media files are no longer on the server. Please re-upload or remove missing items from the playlist editor.',
        },
      }),
    };
    
    // Normalize media URLs in playlist items (fix old IP addresses)
    const coreBaseUrl = getCoreBaseUrl(req);
    response.items = normalizePlaylistItems(response.items, coreBaseUrl);
    
    res.json(response);
    console.log(`[PLAYLIST] [${requestId}] Response sent successfully (total ${Date.now() - requestStartTime}ms)`);
  } catch (error) {
    const duration = Date.now() - requestStartTime;
    console.error(`[PLAYLIST] [${requestId}] ERROR after ${duration}ms:`, error.message);
    console.error(`[PLAYLIST] [${requestId}] Error stack:`, error.stack);
    return next(error);
  }
});

// PUT /api/screens/:id/playlist - Assign/unassign playlist to screen
// PATCH /api/screens/:id/playlist - Alias for PUT (same functionality)
// OpenAPI: PUT /api/screens/{id}/playlist
// Request: { playlistId: string | null }
// Response: { ok: true, screenId: string, playlistId: string | null }
const handlePlaylistAssignment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { playlistId } = req.body || {};

    // If user is authenticated, check store access permissions
    if (req.user) {
      const userRole = req.user.role || 'viewer';
      if (userRole === 'viewer') {
        return res.status(403).json({ 
          ok: false,
          error: 'Insufficient permissions',
          message: 'This action requires owner or staff permissions'
        });
      }
    }

    const screen = await getScreenOr404(prisma, id, { includeDeleted: false });
    if (!screen) {
      return res.status(404).json({ ok: false, error: 'screen_not_found' });
    }

    const requestedUnset = playlistId === null || typeof playlistId === 'undefined' || (typeof playlistId === 'string' && playlistId.trim() === '');

    if (requestedUnset) {
      if (screen.assignedPlaylistId) {
        await prisma.screen.update({
          where: { id: screen.id },
          data: { assignedPlaylistId: null, updatedAt: new Date() },
        });
        logger.info('[PLAYLIST] assign', { screenId: id, playlistId: null });
        broadcast('screen.playlist_assigned', { screenId: id, playlistId: null });
        broadcast('screen.updated', { screenId: id, playlistId: null });
      }
      return res.status(200).json({ ok: true, screenId: id, playlistId: null });
    }

    // Validate playlist exists
    const playlist = await prisma.playlist.findFirst({ where: { id: String(playlistId) } });
    if (!playlist) {
      return res.status(400).json({ ok: false, error: 'playlist_not_found' });
    }

    if (screen.assignedPlaylistId !== String(playlistId)) {
      await prisma.screen.update({
        where: { id: screen.id },
        data: { assignedPlaylistId: String(playlistId), updatedAt: new Date() },
      });
      logger.info('[PLAYLIST] assign', { screenId: id, playlistId });
      // Emit both a specific and generic event for compatibility
      broadcast('screen.playlist_assigned', { screenId: id, playlistId });
      broadcast('screen.updated', { screenId: id, playlistId });
    } else {
      logger.info('[PLAYLIST] assign (noop - already assigned)', { screenId: id, playlistId });
    }

    return res.status(200).json({ ok: true, screenId: id, playlistId });
  } catch (error) {
    return next(error);
  }
};

// Support both PUT and PATCH for playlist assignment
// Use optionalAuth to allow unauthenticated requests in dev, but still check permissions if token is provided
router.put('/screens/:id/playlist', optionalAuth, handlePlaylistAssignment);
router.patch('/screens/:id/playlist', optionalAuth, handlePlaylistAssignment);

router.get('/screens/:id', async (req, res, next) => {
  try {
    const includeDeleted = req.query.includeDeleted === '1' || req.query.includeDeleted === 'true';
    const screen = await getScreenOr404(prisma, req.params.id, { includeDeleted });
    
    if (!screen) {
      return res.status(404).json({ ok: false, error: 'screen_not_found' });
    }
    
    return res.json(screen);
  } catch (error) {
    return next(error);
  }
});

// PATCH /api/screens/:id - Update screen (name, location, orientation, etc.)
// Request: { name?: string, location?: string, orientation?: 'horizontal' | 'vertical' }
// Response: { ok: true, screen: {...} }
router.patch('/screens/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, location, orientation } = req.body || {};

    const screen = await getScreenOr404(prisma, id, { includeDeleted: false });
    if (!screen) {
      return res.status(404).json({ ok: false, error: 'screen_not_found' });
    }

    // Build update data
    const updateData = {};
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({
          ok: false,
          error: 'Invalid name',
          message: 'Name must be a non-empty string'
        });
      }
      updateData.name = name.trim();
    }
    if (location !== undefined) {
      updateData.location = location === null || location === '' ? null : String(location).trim();
    }
    if (orientation !== undefined) {
      // Validate orientation value
      if (orientation !== 'horizontal' && orientation !== 'vertical') {
        return res.status(400).json({
          ok: false,
          error: 'Invalid orientation',
          message: 'Orientation must be "horizontal" or "vertical"'
        });
      }
      updateData.orientation = orientation;
      
      // Log orientation update
      logger.info('[Device] Updating orientation', {
        deviceId: id, // Screen ID (legacy screens)
        orientation: orientation,
      });
    }

    // At least one field must be provided
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'No fields to update',
        message: 'At least one field (name, location, or orientation) must be provided'
      });
    }

    // Update screen
    const updatedScreen = await prisma.screen.update({
      where: { id: screen.id },
      data: updateData
    });

    // Broadcast update event
    broadcast('screen.updated', {
      screenId: id,
      name: updatedScreen.name,
      location: updatedScreen.location,
      orientation: updatedScreen.orientation,
    });

    logger.info('[SCREENS] Updated screen', { screenId: id, fields: Object.keys(updateData) });

    return res.json({
      ok: true,
      screen: updatedScreen
    });
  } catch (error) {
    return next(error);
  }
});

// POST /api/screens/:id/refresh - Trigger screen refresh/reload
// Response: { ok: true }
router.post('/screens/:id/refresh', async (req, res, next) => {
  try {
    const { id } = req.params;

    const screen = await getScreenOr404(prisma, id, { includeDeleted: false });
    if (!screen) {
      return res.status(404).json({ ok: false, error: 'screen_not_found' });
    }

    // Broadcast refresh event to trigger screen reload
    broadcast('screen.refresh', {
      screenId: id,
      name: screen.name
    });

    logger.info('[SCREENS] Refresh triggered', { screenId: id });

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

// POST /api/screens/:id/heartbeat - Device heartbeat
// ⚠️ DEPRECATED: Legacy Screen heartbeat endpoint - FOR LEGACY SCREENS ONLY
// 
// NEW PLAYERS MUST USE: POST /api/device/heartbeat
// 
// This endpoint is ONLY for legacy Screen records that were paired via:
//   POST /api/screens/pair/initiate → POST /api/screens/pair/complete
// 
// New players should:
//   1. Use POST /api/device/request-pairing to get a pairing code
//   2. Use POST /api/device/heartbeat for heartbeats
//   3. Appear in the Devices page, NOT the legacy Screen Management page
// 
// Devices should call this every 60s to keep status='online'
// Body: { token: string }
// Response: { ok: true }
router.post('/screens/:id/heartbeat', async (req, res, next) => {
  const requestId = req.requestId || Math.random().toString(36).slice(2, 9);
  try {
    const { id } = req.params;
    const { token } = req.body;

    // Get screen (excluding soft-deleted)
    const screen = await getScreenOr404(prisma, id, { includeDeleted: false });

    if (!screen) {
      return res.status(404).json({ ok: false, error: 'screen_not_found' });
    }

    // Validate token if provided (check pairing sessions for this screen)
    if (token) {
      // Check if token matches a bound pairing session for this screen
      const boundSession = await prisma.pairingSession.findFirst({
        where: {
          screenId: id,
          deviceToken: token,
          status: 'bound',
        },
      });

      if (!boundSession) {
        // Token validation failed - but don't block heartbeat (token is optional)
        // Log warning but continue processing
        warn('SCREENS', 'Invalid token in heartbeat (token validation optional)', {
          screenId: id,
          tokenProvided: !!token,
          requestId,
        });
      }
    }

    // Update lastSeen and status
    const wasOffline = screen.status === 'OFFLINE' || screen.status === 'offline';
    const now = new Date();

    await prisma.screen.update({
      where: { id: screen.id },
      data: {
        lastSeen: now,
        status: 'ONLINE',
      },
    });

    // Emit SSE event if status changed from offline to online
    if (wasOffline) {
      broadcast('screen.online', {
        id: screen.id,
        name: screen.name,
      });
    }

    // Log heartbeat
    debug('SCREENS', 'Screen heartbeat', {
      screenId: screen.id,
      status: 'ONLINE',
      wasOffline,
      requestId,
    });

    return res.json({ ok: true });
  } catch (error) {
    console.error('[PAIR] HEARTBEAT error:', error);
    return next(error);
  }
});

router.get('/screens/pending', async (_req, res, next) => {
  try {
    const pending = await prisma.screen.findMany({
      where: {
        paired: false,
        deletedAt: null, // Exclude soft-deleted screens
      },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ ok: true, items: pending });
  } catch (error) {
    return next(error);
  }
});

// POST /api/screens/hello - Device discovery/announcement
// This endpoint allows devices to announce themselves before pairing
// It creates or updates a Screen record and automatically creates a pairing session for unpaired devices
// Pairing must be done via /api/screens/pair/register
// Rate limit: 20 requests per minute per IP (increased for device discovery)
router.post('/screens/hello',
  rateLimit({ windowMs: 60 * 1000, max: 20 }), // 20 requests per minute
  async (req, res, next) => {
    try {
      const fp = String(req.body?.fingerprint || '').toUpperCase();
      if (!fp) {
        return res.status(400).json({ ok: false, error: 'fingerprint_required' });
      }
      const model = req.body?.model || 'Unknown';
      const bodyDeviceId = req.body?.deviceId ? String(req.body.deviceId) : null;
      const bodyName = req.body?.name || null;
      const bodyLocation = req.body?.location || null;

      // Check if screen exists (including soft-deleted ones)
      const existing = await prisma.screen.findUnique({ where: { fingerprint: fp } });
      
      let screen;
      let isNewDevice = false;
      if (existing) {
        // If soft-deleted, restore it; otherwise update
        if (existing.deletedAt) {
          screen = await prisma.screen.update({
            where: { fingerprint: fp },
            data: {
              deletedAt: null, // Restore
              statusText: 'new',
              updatedAt: new Date(),
            },
          });
          console.log(`[PAIR] HELLO restored soft-deleted screen: fingerprint=${fp}`);
          isNewDevice = !existing.paired;
        } else {
          screen = await prisma.screen.update({
            where: { fingerprint: fp },
            data: { statusText: 'new', updatedAt: new Date() },
          });
          isNewDevice = !existing.paired;
        }
      } else {
        screen = await prisma.screen.create({
          data: {
            fingerprint: fp,
            name: bodyName || null,
            location: bodyLocation || null,
            status: 'OFFLINE',
            statusText: 'new',
            paired: false,
          },
        });
        console.log(`[PAIR] HELLO new device: fingerprint=${fp}, model=${model}`);
        isNewDevice = true;
      }

      // NOTE: /hello endpoint should NOT create pairing sessions
      // Pairing sessions are created via POST /api/screens/pair/initiate (device-initiated)
      // This endpoint only creates/updates the screen record for device discovery

      broadcast('screen:new', { fingerprint: fp, model, createdAt: screen.createdAt });

      // Light debug log
      logger.info('[PAIR] hello', { screenId: screen.id, fingerprint: fp });

      return res.json({
        ok: true,
        screenId: screen.id,
        paired: screen.paired,
      });
    } catch (error) {
      console.error('[PAIR] HELLO error:', error);
      return next(error);
    }
  }
);

// Device-centric hello: POST /api/devices/hello
// Body: { deviceId, fingerprint, model, appVersion }
// Response: { status: 'unpaired'|'paired', screenId?: string }
router.post('/devices/hello', async (req, res, next) => {
  try {
    const deviceId = req.body?.deviceId ? String(req.body.deviceId) : '';
    const fp = String(req.body?.fingerprint || '').toUpperCase();
    const model = req.body?.model || 'Unknown';
    const appVersion = req.body?.appVersion || '';

    if (!deviceId) {
      return res.status(400).json({ ok: false, error: 'device_id_required' });
    }
    if (!fp) {
      return res.status(400).json({ ok: false, error: 'fingerprint_required' });
    }

    // Try find an existing paired screen by fingerprint
    const existing = await prisma.screen.findFirst({
      where: { fingerprint: fp, deletedAt: null },
      select: { id: true, paired: true },
    });

    logger.info('[PAIR] device.hello', { deviceId, fingerprint: fp, model, appVersion });

    if (existing && existing.paired) {
      return res.json({ status: 'paired', screenId: existing.id });
    }

    return res.json({ status: 'unpaired' });
  } catch (error) {
    return next(error);
  }
});

// POST /api/screens/pair/initiate - Create a new pairing session (device-initiated)
// ⚠️ FROZEN: Legacy Screen pairing endpoint is FROZEN
// 
// This endpoint is FROZEN and will return an error directing to DeviceEngine V2.
// 
// NEW PLAYERS MUST USE: POST /api/device/request-pairing
// 
// Legacy players should migrate to DeviceEngine V2. This endpoint will not process new pairing requests.
// C-Net Pairing Engine: TV/slideshow app calls this to get a pairing code
// Request: { fingerprint: string (required), model: string (required), name?: string, location?: string }
// Response: { ok: true, sessionId: string, code: string, expiresAt: ISO string, ttlLeftMs: number, status: "showing_code" }
// Rate limit: 30 requests per minute per IP (increased for device pairing)
router.post('/screens/pair/initiate', 
  rateLimit({ windowMs: 60 * 1000, max: 30 }), // 30 requests per minute (increased for device pairing)
  async (req, res, next) => {
    // ⚠️ FROZEN: Legacy Screen pairing is frozen. Use DeviceEngine V2 instead.
    // But allow in test/dev mode for backward compatibility
    const isTestOrDev = process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development';
    
    if (!isTestOrDev) {
      console.warn('[PAIR] FROZEN: /api/screens/pair/initiate called. Legacy pairing is frozen. Use POST /api/device/request-pairing instead.');
      return res.status(410).json({
        ok: false,
        error: 'ENDPOINT_FROZEN',
        message: 'Legacy Screen pairing is frozen. Please use DeviceEngine V2: POST /api/device/request-pairing to get a pairing code. Devices paired via DeviceEngine V2 appear in the Devices page.',
        frozen: true,
        migration: {
          oldEndpoint: 'POST /api/screens/pair/initiate',
          newEndpoint: 'POST /api/device/request-pairing',
          documentation: 'See DeviceEngine V2 pairing flow documentation',
        },
      });
    }
    
    // Allow in test/dev mode - uncomment frozen code
    try {
      const fingerprint = req.body?.fingerprint ? String(req.body.fingerprint).toUpperCase().trim() : null;
      const model = req.body?.model ? String(req.body.model).trim() : null;
      const name = req.body?.name ? String(req.body.name).trim() : null;
      const location = req.body?.location ? String(req.body.location).trim() : null;
      const ttlSec = Number(req.body?.ttlSec) || 300; // Default 5 minutes

      // Validate required fields
      if (!fingerprint) {
        return res.status(400).json({ ok: false, error: 'fingerprint_required' });
      }
      if (!model) {
        return res.status(400).json({ ok: false, error: 'model_required' });
      }

      // Check max active sessions (prevent flooding)
      const activeCount = await getActiveSessionCount();
      const MAX_ACTIVE_SESSIONS = 10;
      if (activeCount >= MAX_ACTIVE_SESSIONS) {
        console.warn(`[PAIR] INITIATE rejected: max active sessions reached (${activeCount}) from ${req.ip}`);
        return res.status(429).json({
          ok: false,
          error: 'too_many_active_sessions',
          message: 'Maximum number of active pairing sessions reached. Please complete or wait for existing sessions to expire.',
        });
      }

      // Optionally check for existing screen with same fingerprint (for reuse later)
      const existingScreen = await prisma.screen.findFirst({
        where: { fingerprint, deletedAt: null },
        select: { id: true },
      });

      // Create new pairing session
      const session = await createPairSession({
        ttlSec,
        fingerprint,
        model,
        name: name || model, // Use model as default name if not provided
        location: location || null,
        origin: 'device',
      });

      console.log(`[PAIR] INITIATE sessionId=${session.sessionId} code=${session.code} fingerprint=${fingerprint} model=${model}`);
      recordInitiate();

      const expiresAtDate = new Date(session.expiresAt);
      const ttlLeftMs = Math.max(0, expiresAtDate.getTime() - Date.now());

      // Broadcast events for dashboards
      // Send both event names for compatibility (dashboard may listen to either)
      try {
        const eventData = {
          type: 'pairing_started',
          sessionId: session.sessionId,
          code: session.code,
          fingerprint: session.fingerprint,
          model: session.model,
          name: session.name,
          location: session.location || null,
          expiresAt: expiresAtDate.toISOString(),
          ttlLeftMs,
          status: session.status,
          deviceType: model?.toLowerCase().includes('tv') || model?.toLowerCase().includes('android tv') ? 'tv' : 'tablet', // Add device type for dashboard filtering
        };

        // Broadcast 'pairing_started' event
        broadcast('pairing_started', eventData, { key: 'admin' });
        console.log(`[PAIR] Broadcast 'pairing_started' event: code=${session.code} sessionId=${session.sessionId} model=${model} deviceType=${eventData.deviceType}`);

        // Also broadcast 'screen.pair_session.created' (dashboard may listen to this)
        const screenEventData = {
          sessionId: session.sessionId,
          code: session.code,
          expiresAt: expiresAtDate.toISOString(),
          ttlLeftMs,
          status: session.status,
          fingerprint: session.fingerprint,
          model: session.model,
          name: session.name,
          location: session.location || null,
          deviceType: eventData.deviceType, // Include device type
        };
        broadcast('screen.pair_session.created', screenEventData, { key: 'admin' });
        console.log(`[PAIR] Broadcast 'screen.pair_session.created' event: code=${session.code} sessionId=${session.sessionId} model=${model} deviceType=${screenEventData.deviceType}`);
      } catch (err) {
        console.error('[PAIR] Failed to emit SSE event', { err: err.message, stack: err.stack });
      }

      logger.info('[PAIR] initiate', {
        sessionId: session.sessionId,
        code: session.code,
        fingerprint,
        model,
        ttlLeftMs,
      });

      return res.json({
        ok: true,
        sessionId: session.sessionId,
        code: session.code,
        expiresAt: expiresAtDate.toISOString(),
        ttlLeftMs,
        status: session.status,
      });
    } catch (error) {
      console.error('[PAIR] INITIATE error:', error);
      return next(error);
    }
  }
);

// GET /api/screens/pair/peek/:code - Check pairing code status (for dashboards)
// C-Net Pairing Engine: Dashboards call this to check if a code exists and get session details
// Response: { ok: true, exists: boolean, ttlLeftMs: number, session?: {...} }
// If code unknown or expired → { ok: true, exists: false, ttlLeftMs: 0 }
// Rate limit: 30 requests per minute per IP
router.get('/screens/pair/peek/:code',
  rateLimit({ windowMs: 60 * 1000, max: 30 }), // 30 requests per minute
  async (req, res, next) => {
    try {
      const rawCode = String(req.params.code || '').trim();
      if (!rawCode) {
        return res.status(400).json({ ok: false, error: 'code_required' });
      }
      
      // Expire sessions before checking
      await expireSessions();
      
      const session = await findByCode(rawCode);
      
      if (!session) {
        // Return 200 with exists:false (not 404) to avoid CORS noise
        return res.status(200).json({ ok: true, exists: false, ttlLeftMs: 0 });
      }

      const expiresAtDate = new Date(session.expiresAt);
      const ttlLeftMs = Math.max(0, expiresAtDate.getTime() - Date.now());
      
      // If expired and not bound, mark as expired and return exists:false
      if (ttlLeftMs <= 0 && session.status !== 'bound') {
        if (session.status !== 'expired') {
          await updatePairSession(session.sessionId, 'expired');
        }
        return res.status(200).json({ ok: true, exists: false, ttlLeftMs: 0 });
      }

      recordPeek();
      console.log(`[PAIR] PEEK code=${rawCode} status=${session.status} ttlLeftMs=${ttlLeftMs}`);

      logger.info('[PAIR] peek', { code: rawCode, status: session.status, ttlLeftMs });

      return res.status(200).json({
        ok: true,
        exists: true,
        ttlLeftMs,
        session: {
          sessionId: session.sessionId,
          code: session.code,
          status: session.status,
          fingerprint: session.fingerprint,
          model: session.model,
          name: session.name,
          location: session.location || null,
        },
      });
    } catch (error) {
      console.error('[PAIR] PEEK error:', error);
      return next(error);
    }
  }
);

// GET /api/screens/pair/sessions/:sessionId/status - Check pairing session status (for TV polling)
// ⚠️ DEPRECATED: Legacy Screen pairing endpoint - FOR LEGACY SCREENS ONLY
// 
// NEW PLAYERS: Use POST /api/device/heartbeat instead
// This endpoint is for legacy players that use PairingSession records.
// C-Net Pairing Engine: TV polls this to check if pairing is complete
// Response cases:
//   - showing_code: { ok: true, status: "showing_code", ttlLeftMs: number }
//   - bound: { ok: true, status: "bound", screenId: string, token: string, ttlLeftMs: 0 }
//   - expired: { ok: true, status: "expired", ttlLeftMs: 0 }
// If session unknown → { ok: false, error: "not_found" } with 404
// Rate limit: 30 requests per minute per IP
router.get(
  '/screens/pair/sessions/:sessionId/status',
  rateLimit({ windowMs: 60 * 1000, max: 30 }), // 30 requests per minute
  async (req, res, next) => {
    try {
      const sessionId = String(req.params.sessionId || '').trim();
      if (!sessionId) {
        return res.status(400).json({ ok: false, error: 'sessionId_required' });
      }

      // Expire sessions before checking
      await expireSessions();

      const session = await getPairSession(sessionId);

      if (!session) {
        return res.status(404).json({ ok: false, error: 'not_found' });
      }

      const expiresAtDate = new Date(session.expiresAt);
      const ttlLeftMs = Math.max(0, expiresAtDate.getTime() - Date.now());

      // Determine status (expired if time passed and not bound)
      let status = session.status;
      if (ttlLeftMs <= 0 && status !== 'bound' && status !== 'expired') {
        status = 'expired';
        await updatePairSession(sessionId, 'expired');
      }

      recordPeek();
      console.log(
        `[PAIR] STATUS sessionId=${sessionId} status=${status} ttlLeftMs=${ttlLeftMs} from ${req.ip}`
      );

      logger.info('[PAIR] status', { sessionId, status, ttlLeftMs });

      // Build base response payload (always included)
      const payload = {
        ok: true,
        sessionId: session.sessionId,
        status: status,
        ttlLeftMs: status === 'bound' ? 0 : ttlLeftMs, // bound sessions have ttlLeftMs = 0
      };

      // For "bound" status, include screenId and token
      // CRITICAL: If status is "bound", we MUST have both screenId and token
      // If either is missing, this is a data integrity error - return error instead of incomplete response
      if (status === 'bound') {
        if (!session.screenId || !session.deviceToken) {
          // This should never happen if /pair/complete worked correctly
          console.error(
            `[PAIR] STATUS ERROR: Session ${sessionId} is bound but missing credentials:`,
            {
              screenId: session.screenId || 'MISSING',
              deviceToken: session.deviceToken ? 'present' : 'MISSING',
            }
          );
          return res.status(500).json({
            ok: false,
            error: 'bound_session_missing_credentials',
            message:
              'Session is bound but credentials are missing. This indicates a data integrity issue.',
            sessionId: session.sessionId,
            hasScreenId: !!session.screenId,
            hasDeviceToken: !!session.deviceToken,
          });
        }

        // Both credentials are present - include them in response
        // IMPORTANT: Only include credentials when status is "bound"
        // For other statuses, these fields should NOT be present
        payload.screenId = session.screenId;
        payload.token = session.deviceToken;
        console.log(
          `[PAIR] STATUS bound: screenId=${session.screenId} token=${session.deviceToken.substring(
            0,
            20
          )}... (full response: ${JSON.stringify(payload)})`
        );
      } else {
        // For non-bound statuses, explicitly DO NOT include screenId or token
        // This makes it clear to the tablet app that credentials are not available yet
        // The tablet should only check for credentials when status === "bound"
        console.log(
          `[PAIR] STATUS ${status}: response=${JSON.stringify(
            payload
          )} (no credentials - status is not bound)`
        );
      }

      return res.status(200).json(payload);
    } catch (error) {
      console.error('[PAIR] STATUS error:', error);
      return next(error);
    }
  }
);

// POST /api/screens/pair/sessions/:sessionId/bind - Bind a pairing session to a Screen
// Request: { code: string, name?: string, notes?: string }
// Response (success):
//   { ok: true, sessionId, status: "bound", device: { id, name, model } }
// Errors:
//   404 { ok: false, error: "session_not_found" }
//   400 { ok: false, error: "session_expired" | "invalid_code" | "code_required" }
router.post(
  '/screens/pair/sessions/:sessionId/bind',
  rateLimit({ windowMs: 60 * 1000, max: 30 }), // 30 requests per minute
  async (req, res, next) => {
    const { sessionId } = req.params;

    try {
      console.log(`[PAIR] BIND requested sessionId=${sessionId}`);

      if (!req.body || typeof req.body !== 'object') {
        return res.status(400).json({
          ok: false,
          error: 'invalid_request_body',
          message: 'Request body is required',
        });
      }

      const rawCode = req.body?.code ? String(req.body.code).trim().toUpperCase() : '';
      const name = req.body?.name ? String(req.body.name).trim() : null;
      const notes = req.body?.notes ? String(req.body.notes).trim() : null; // Currently unused but accepted

      if (!rawCode) {
        return res.status(400).json({
          ok: false,
          error: 'code_required',
          message: 'Pairing code is required',
        });
      }

      // Expire sessions before binding
      await expireSessions();

      const session = await getPairSession(sessionId);

      if (!session) {
        console.warn(`[PAIR] BIND session_not_found sessionId=${sessionId}`);
        return res.status(404).json({
          ok: false,
          error: 'session_not_found',
        });
      }

      const expiresAtDate = new Date(session.expiresAt);
      const ttlLeftMs = Math.max(0, expiresAtDate.getTime() - Date.now());

      // If expired and not already bound
      if (ttlLeftMs <= 0 && session.status !== 'bound') {
        console.warn(
          `[PAIR] BIND session_expired sessionId=${sessionId} status=${session.status} ttlLeftMs=${ttlLeftMs}`
        );
        if (session.status !== 'expired') {
          try {
            await updatePairSession(session.sessionId, 'expired');
          } catch (err) {
            console.error('[PAIR] BIND updatePairSession(expired) error:', err);
          }
        }
        return res.status(400).json({
          ok: false,
          error: 'session_expired',
        });
      }

      // If already bound, return existing device info (idempotent)
      if (session.status === 'bound' && session.screenId) {
        try {
          const existingScreen = await prisma.screen.findUnique({
            where: { id: session.screenId },
          });

          if (existingScreen) {
            console.log(
              `[PAIR] BIND idempotent success sessionId=${sessionId} screenId=${existingScreen.id}`
            );
            return res.json({
              ok: true,
              sessionId: session.sessionId,
              status: 'bound',
              device: {
                id: existingScreen.id,
                name: existingScreen.name || session.name,
                model: session.model,
              },
            });
          }
        } catch (err) {
          console.error('[PAIR] BIND existingScreen lookup error:', err);
          // Fall through to attempt re-bind if screen lookup fails
        }
      }

      // Validate code
      const sessionCode = String(session.code || '').trim().toUpperCase();
      if (rawCode !== sessionCode) {
        console.warn(
          `[PAIR] BIND invalid_code sessionId=${sessionId} expected=${sessionCode} got=${rawCode}`
        );
        return res.status(400).json({
          ok: false,
          error: 'invalid_code',
        });
      }

      const fingerprint = session.fingerprint;
      let screen = null;

      try {
        // Try to find existing (non-deleted) screen by fingerprint
        const existing = await prisma.screen.findFirst({
          where: { fingerprint, deletedAt: null },
        });

        if (existing) {
          screen = await prisma.screen.update({
            where: { id: existing.id },
            data: {
              paired: true,
              status: 'ONLINE',
              statusText: 'paired',
              name: name || existing.name || session.name,
              location: existing.location || session.location || null,
            },
          });
        } else {
          // Check for soft-deleted screen by fingerprint and restore if found
          const deleted = await prisma.screen.findUnique({
            where: { fingerprint },
          });

          if (deleted && deleted.deletedAt) {
            screen = await prisma.screen.update({
              where: { id: deleted.id },
              data: {
                deletedAt: null,
                paired: true,
                status: 'ONLINE',
                statusText: 'paired',
                name: name || deleted.name || session.name,
                location: deleted.location || session.location || null,
              },
            });
          } else {
            // Create new screen
            screen = await prisma.screen.create({
              data: {
                fingerprint,
                name: name || session.name,
                location: session.location || null,
                paired: true,
                status: 'ONLINE',
                statusText: 'paired',
              },
            });
          }
        }
      } catch (dbError) {
        console.error('[PAIR] BIND screen create/update error:', dbError);
        return res.status(500).json({
          ok: false,
          error: 'database_error',
          message: 'Failed to create or update screen',
        });
      }

      // Generate device token (deviceJwt) for this screen
      const token = `${screen.id}-${Math.random().toString(36).slice(2, 8)}`;

      // Build claimedBy metadata (best-effort, may be null)
      const claimedBy = JSON.stringify({
        userId: req.user?.id || null,
        workspaceId: req.workspace?.id || null,
        claimedAt: new Date().toISOString(),
        notes: notes || null,
        via: 'sessions.bind',
      });

      let updatedSession;
      try {
        updatedSession = await updatePairSession(session.sessionId, 'bound', {
          screenId: screen.id,
          deviceToken: token,
          claimedBy,
          name: name || session.name,
          location: session.location || null,
        });

        if (!updatedSession) {
          console.error(
            '[PAIR] BIND updatePairSession returned null for sessionId:',
            session.sessionId
          );
          return res.status(500).json({
            ok: false,
            error: 'database_error',
            message: 'Failed to update pairing session',
          });
        }
      } catch (dbError) {
        console.error('[PAIR] BIND updatePairSession error:', dbError);
        return res.status(500).json({
          ok: false,
          error: 'database_error',
          message: 'Failed to update pairing session',
        });
      }

      console.log(
        `[PAIR] BIND success sessionId=${sessionId} screenId=${screen.id} token=${token.substring(
          0,
          8
        )}...`
      );

      return res.json({
        ok: true,
        sessionId: updatedSession.sessionId,
        status: 'bound',
        device: {
          id: screen.id,
          name: screen.name || updatedSession.name,
          model: updatedSession.model || session.model,
        },
      });
    } catch (error) {
      console.error('[PAIR] BIND error:', error);
      return next(error);
    }
  }
);

// DEPRECATED: POST /api/screens/pair/start - Dashboard-initiated code generation (OLD FLOW)
// This endpoint is DEPRECATED but still functional for backward compatibility with tests.
// The canonical flow is device-initiated:
//   1. TV/Device calls POST /api/screens/pair/initiate (device-initiated)
//   2. Dashboard calls GET /api/screens/pair/peek/:code to see the code
//   3. Dashboard calls POST /api/screens/pair/complete to complete pairing
router.post('/screens/pair/start', async (req, res, next) => {
  console.warn('[PAIR] DEPRECATED: /api/screens/pair/start called. Dashboards should use device-initiated pairing flow.');
  console.warn('[PAIR] Device should call POST /api/screens/pair/initiate, then dashboard uses GET /api/screens/pair/peek/:code and POST /api/screens/pair/complete');
  
  try {
    // Generate a pairing code for backward compatibility (tests still use this)
    const ttlSec = 300; // 5 minutes default TTL
    const session = await createPairSession({
      ttlSec,
      fingerprint: null, // Dashboard-initiated, no device fingerprint yet
      model: null,
      name: null,
      location: null,
      origin: 'dashboard', // Mark as dashboard-initiated
    });

    const expiresAtDate = new Date(session.expiresAt);
    const ttlLeftMs = Math.max(0, expiresAtDate.getTime() - Date.now());

    console.log(`[PAIR] START (deprecated) sessionId=${session.sessionId} code=${session.code}`);
    
    return res.status(201).json({
      ok: true,
      code: session.code,
      sessionId: session.sessionId,
      ttlLeftMs,
      expiresAt: expiresAtDate.toISOString(),
      deprecated: true,
      message: 'This endpoint is deprecated. Use device-initiated pairing flow instead.',
    });
  } catch (error) {
    console.error('[PAIR] START error:', error);
    return next(error);
  }
});

// GET /api/screens/pair/active - Get all active pairing sessions
// OpenAPI: GET /api/screens/pair/active
// Response: { ok: true, sessions: [{ code: string, ttlLeftMs: number, status: string }] }
router.get('/screens/pair/active', async (req, res, next) => {
  try {
    await expireSessions();
    const activeSessions = await getAllActiveSessions();
    
    const sessions = activeSessions.map(session => {
      const expiresAtDate = new Date(session.expiresAt);
      return {
        code: session.code,
        ttlLeftMs: Math.max(0, expiresAtDate.getTime() - Date.now()),
        status: session.status,
      };
    });

    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      ok: true,
      sessions,
    });
  } catch (error) {
    return next(error);
  }
});

// DEPRECATED: POST /api/screens/pair/register
// This endpoint is deprecated. Pairing completion must be done from the dashboard.
// The canonical pairing flow is:
//   1. Device: POST /api/screens/pair/initiate → gets code
//   2. Device: Polls GET /api/screens/pair/sessions/:sessionId/status
//   3. Dashboard: POST /api/screens/pair/complete → completes pairing
// This endpoint returns an error directing to the correct flow.
router.post('/screens/pair/register',
  rateLimit({ windowMs: 60 * 1000, max: 10 }),
  async (req, res, next) => {
    console.warn(`[PAIR] DEPRECATED: /pair/register called from ${req.ip}. Pairing must be completed from dashboard via /pair/complete.`);
    
    return res.status(410).json({
      ok: false,
      error: 'ENDPOINT_DEPRECATED',
      message: 'This endpoint is deprecated. Pairing completion must be done from the dashboard. The device should call POST /api/screens/pair/initiate to get a code, then the dashboard calls POST /api/screens/pair/complete to complete pairing.',
      deprecated: true,
    });
  }
);

// REMOVED: POST /api/screens/pair/claim
// This endpoint has been removed. Use POST /api/screens/pair/complete instead.
// The canonical pairing flow is:
//   1. Device: POST /api/screens/pair/initiate
//   2. Device: Polls GET /api/screens/pair/sessions/:sessionId/status
//   3. Dashboard: POST /api/screens/pair/complete

// POST /api/screens/pair/complete - Bind device to account (dashboard-initiated)
// ⚠️ FROZEN: Legacy Screen pairing endpoint is FROZEN
// 
// This endpoint is FROZEN and will return an error directing to DeviceEngine V2.
// 
// NEW PLAYERS MUST USE: POST /api/device/complete-pairing
// 
// Legacy players should migrate to DeviceEngine V2. This endpoint will not process new pairing requests.
// New players should:
//   1. Use POST /api/device/request-pairing to get a pairing code
//   2. Dashboard calls POST /api/device/complete-pairing to complete pairing
//   3. Appear in the Devices page, NOT the legacy Screen Management page
// 
// Request: { code: string, name?: string, location?: string, tenantId?: string, storeId?: string }
// Response: { ok: true, screenId: string, token: string, session: {...} }
// Errors: 400 { ok: false, error: "invalid_or_expired_code" }
// Rate limit: 20 requests per minute per IP
// NOTE: tenantId and storeId can come from req.body, req.query, or req.user/req.workspace
router.post('/screens/pair/complete',
  rateLimit({ windowMs: 60 * 1000, max: 20 }), // 20 requests per minute
  async (req, res, next) => {
    // ⚠️ FROZEN: Legacy Screen pairing is frozen. Use DeviceEngine V2 instead.
    console.warn('[PAIR] FROZEN: /api/screens/pair/complete called. Legacy pairing is frozen. Use POST /api/device/complete-pairing instead.');
    return res.status(410).json({
      ok: false,
      error: 'ENDPOINT_FROZEN',
      message: 'Legacy Screen pairing is frozen. Please use DeviceEngine V2: POST /api/device/complete-pairing to complete pairing. Devices paired via DeviceEngine V2 appear in the Devices page.',
      frozen: true,
      migration: {
        oldEndpoint: 'POST /api/screens/pair/complete',
        newEndpoint: 'POST /api/device/complete-pairing',
        documentation: 'See DeviceEngine V2 pairing flow documentation',
      },
    });
    
    /* FROZEN CODE - DO NOT USE
    const startTime = Date.now();
    const requestId = Math.random().toString(36).slice(2, 9);
    
    try {
      console.log(`[PAIR] COMPLETE [${requestId}] Request received from ${req.ip}`, {
        origin: req.headers.origin,
        'content-type': req.headers['content-type'],
        bodyKeys: req.body ? Object.keys(req.body) : 'none',
      });

      // Validate request body
      if (!req.body || typeof req.body !== 'object') {
        console.warn(`[PAIR] COMPLETE [${requestId}] Invalid request body`);
        return res.status(400).json({ 
          ok: false, 
          error: 'invalid_request_body',
          message: 'Request body is required' 
        });
      }

      const code = req.body?.code ? String(req.body.code).trim().toUpperCase() : '';
      const name = req.body?.name ? String(req.body.name).trim() : null;
      const location = req.body?.location ? String(req.body.location).trim() : null;
      // Get tenantId and storeId from body, query, or auth context
      const tenantId = req.body?.tenantId || req.query?.tenantId || req.user?.business?.tenantId || req.workspace?.tenantId || null;
      const storeId = req.body?.storeId || req.query?.storeId || req.user?.business?.storeId || req.workspace?.storeId || null;

      console.log(`[PAIR] COMPLETE [${requestId}] Processing code: "${code}" tenantId=${tenantId || 'none'} storeId=${storeId || 'none'}`);

      if (!code) {
        return res.status(400).json({ ok: false, error: 'code_required' });
      }

      // Validate code format (6 characters)
      if (code.length !== 6) {
        console.warn(`[PAIR] COMPLETE [${requestId}] Invalid code format: length=${code.length}, code="${code}"`);
        return res.status(400).json({ 
          ok: false, 
          error: 'invalid_code_format',
          message: 'Pairing code must be 6 characters' 
        });
      }

      // tenantId and storeId are required for Device creation
      if (!tenantId || !storeId) {
        return res.status(400).json({ 
          ok: false, 
          error: 'tenant_and_store_required',
          message: 'tenantId and storeId are required. Provide them in the request body or ensure you are authenticated with a workspace context.' 
        });
      }

      try {
        // Expire sessions before checking
        await expireSessions();
      } catch (dbError) {
        console.error('[PAIR] COMPLETE expireSessions error:', dbError);
        return res.status(500).json({ 
          ok: false, 
          error: 'database_error',
          message: 'Failed to expire sessions' 
        });
      }
      
      let session;
      try {
        session = await findByCode(code);
      } catch (dbError) {
        console.error('[PAIR] COMPLETE [${requestId}] findByCode error:', dbError);
        return res.status(500).json({ 
          ok: false, 
          error: 'database_error',
          message: 'Failed to lookup pairing session' 
        });
      }

      if (!session) {
        // Check if there are any active sessions to help debug
        const activeCount = await getActiveSessionCount();
        console.warn(`[PAIR] COMPLETE [${requestId}] Code not found: "${code}" (active sessions: ${activeCount})`);
        
        // Log all active session codes for debugging (limit to 10)
        try {
          const activeSessions = await prisma.pairingSession.findMany({
            where: {
              status: { notIn: ['expired', 'bound'] },
              expiresAt: { gt: new Date() },
            },
            select: { code: true, status: true, expiresAt: true, createdAt: true },
            take: 10,
            orderBy: { createdAt: 'desc' },
          });
          if (activeSessions.length > 0) {
            const sessionList = activeSessions.map(s => {
              const ttl = Math.max(0, new Date(s.expiresAt).getTime() - Date.now());
              return `${s.code}(${s.status}, TTL:${Math.round(ttl/1000)}s)`;
            }).join(', ');
            console.log(`[PAIR] COMPLETE [${requestId}] Active session codes: ${sessionList}`);
          } else {
            console.log(`[PAIR] COMPLETE [${requestId}] No active sessions found in database`);
          }
          
          // Also check ALL sessions (including expired) for debugging
          const allRecentSessions = await prisma.pairingSession.findMany({
            where: {
              createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) }, // Last 10 minutes
            },
            select: { code: true, status: true, expiresAt: true, createdAt: true },
            take: 5,
            orderBy: { createdAt: 'desc' },
          });
          if (allRecentSessions.length > 0) {
            console.log(`[PAIR] COMPLETE [${requestId}] Recent sessions (last 10 min):`, 
              allRecentSessions.map(s => `${s.code}(${s.status}, created:${s.createdAt.toISOString()})`).join(', '));
          }
        } catch (e) {
          console.error(`[PAIR] COMPLETE [${requestId}] Error checking sessions:`, e);
        }
        
        return res.status(400).json({ 
          ok: false, 
          error: 'invalid_or_expired_code',
          message: `Pairing code "${code}" not found or expired. Please show a new code on the device.`
        });
      }
      
      console.log(`[PAIR] COMPLETE [${requestId}] Found session: code=${session.code} status=${session.status} sessionId=${session.sessionId} expiresAt=${session.expiresAt}`);

      // Validate session has required fields
      if (!session.fingerprint) {
        console.error('[PAIR] COMPLETE session missing fingerprint:', session.sessionId);
        return res.status(500).json({ 
          ok: false, 
          error: 'invalid_session',
          message: 'Session is missing required fingerprint' 
        });
      }

      // Check if expired
      const expiresAtDate = new Date(session.expiresAt);
      const ttlLeftMs = Math.max(0, expiresAtDate.getTime() - Date.now());
      if (session.status === 'expired' || ttlLeftMs <= 0) {
        console.log(`[PAIR] COMPLETE [${requestId}] Code expired: code=${code} status=${session.status} ttlLeftMs=${ttlLeftMs} expiresAt=${session.expiresAt}`);
        if (session.status !== 'expired') {
          try {
            await updatePairSession(session.sessionId, 'expired');
          } catch (dbError) {
            console.error('[PAIR] COMPLETE updatePairSession error:', dbError);
          }
        }
        return res.status(400).json({ 
          ok: false, 
          error: 'invalid_or_expired_code',
          message: `Pairing code "${code}" has expired (TTL was ${Math.round(ttlLeftMs / 1000)}s). Please show a new code on the device.`
        });
      }

      // If already bound, return existing result (idempotent)
      // Check for deviceId first (new Device Engine), then screenId (legacy)
      if (session.status === 'bound' && session.deviceToken) {
        try {
          // Try to find device by deviceId (stored in screenId field for backward compat, or new deviceId field)
          let device = null;
          if (session.deviceId) {
            device = await prisma.device.findUnique({
              where: { id: session.deviceId },
            });
          } else if (session.screenId) {
            // Legacy: screenId might actually be a deviceId
            device = await prisma.device.findUnique({
              where: { id: session.screenId },
            });
            // If not found as device, check if it's a legacy Screen
            if (!device) {
              const legacyScreen = await prisma.screen.findUnique({
                where: { id: session.screenId },
              });
              if (legacyScreen) {
                // Return legacy format for backward compatibility
                return res.json({
                  ok: true,
                  screenId: session.screenId,
                  deviceId: session.screenId, // Use screenId as deviceId for legacy
                  token: session.deviceToken,
                  session: {
                    sessionId: session.sessionId,
                    code: session.code,
                    status: 'bound',
                    expiresAt: expiresAtDate.toISOString(),
                    fingerprint: session.fingerprint,
                    model: session.model,
                    name: session.name,
                    location: session.location || null,
                  },
                });
              }
            }
          }

          if (device) {
            return res.json({
              ok: true,
              deviceId: device.id,
              screenId: device.id, // Backward compatibility
              token: session.deviceToken,
              session: {
                sessionId: session.sessionId,
                code: session.code,
                status: 'bound',
                expiresAt: expiresAtDate.toISOString(),
                fingerprint: session.fingerprint,
                model: session.model,
                name: session.name,
                location: session.location || null,
              },
            });
          }
        } catch (dbError) {
          console.error('[PAIR] COMPLETE findUnique error:', dbError);
          // Continue to re-pair if device lookup fails
        }
      }

      // Must be in showing_code status to complete
      if (session.status !== 'showing_code') {
        return res.status(400).json({
          ok: false,
          error: 'invalid_session_status',
          status: session.status,
        });
      }

      // Get auth context (user/workspace) - adjust based on your auth middleware
      const claimedBy = JSON.stringify({
        userId: req.user?.id || null,
        workspaceId: req.workspace?.id || null,
        claimedAt: new Date().toISOString(),
      });

      // Find or create Device (not Screen)
      // NEW: Create Device record for new players
      let device = null;
      const fingerprint = session.fingerprint;

      try {
        // Try to find existing device by fingerprint (if we stored it)
        // Note: Device model doesn't have fingerprint field, so we'll use a different approach
        // For now, we'll create a new device each time (devices can be re-paired)
        // In the future, we might want to add a fingerprint field to Device model

        // Check if there's an existing device with the same model/platform that's unpaired
        // This is a best-effort match - not perfect but helps with re-pairing scenarios
        const existingDevice = await prisma.device.findFirst({
          where: {
            tenantId: 'temp',
            storeId: 'temp',
            model: session.model || undefined,
            pairingCode: null, // Already paired
          },
          orderBy: { createdAt: 'desc' },
        });

        if (existingDevice && existingDevice.tenantId === 'temp') {
          // Update existing temp device with real tenant/store info
          device = await prisma.device.update({
            where: { id: existingDevice.id },
            data: {
              tenantId,
              storeId,
              name: name || existingDevice.name || session.name,
              location: location || existingDevice.location || session.location,
              status: 'online',
              lastSeenAt: new Date(),
            },
          });
          console.log(`[PAIR] COMPLETE [${requestId}] Updated existing temp device: ${device.id}`);
        } else {
          // Create new Device record
          device = await prisma.device.create({
            data: {
              tenantId,
              storeId,
              name: name || session.name,
              location: location || session.location || null,
              model: session.model || null,
              platform: session.origin || 'device', // Use origin from session or default
              type: 'screen', // Default type - can be inferred from platform/model later
              status: 'online',
              lastSeenAt: new Date(),
            },
          });
          console.log(`[PAIR] COMPLETE [${requestId}] Created new device: ${device.id}`);
        }
      } catch (dbError) {
        console.error('[PAIR] COMPLETE device create/update error:', dbError);
        return res.status(500).json({ 
          ok: false, 
          error: 'database_error',
          message: 'Failed to create or update device',
          details: process.env.NODE_ENV === 'development' ? dbError.message : undefined
        });
      }

      // Generate device token
      const token = `${device.id}-${Math.random().toString(36).slice(2, 8)}`;

      // Update session to bound with deviceId (not screenId)
      let updatedSession;
      try {
        updatedSession = await updatePairSession(session.sessionId, 'bound', {
          deviceId: device.id, // NEW: Store deviceId instead of screenId
          screenId: device.id, // Keep for backward compatibility with legacy clients
          deviceToken: token,
          claimedBy,
          name: name || session.name,
          location: location || session.location || null,
        });

        if (!updatedSession) {
          console.error('[PAIR] COMPLETE updatePairSession returned null for sessionId:', session.sessionId);
          return res.status(500).json({ 
            ok: false, 
            error: 'database_error',
            message: 'Failed to update pairing session' 
          });
        }
      } catch (dbError) {
        console.error('[PAIR] COMPLETE updatePairSession error:', dbError);
        return res.status(500).json({ 
          ok: false, 
          error: 'database_error',
          message: 'Failed to update pairing session',
          details: process.env.NODE_ENV === 'development' ? dbError.message : undefined
        });
      }

      const duration = Date.now() - startTime;
      console.log(`[PAIR] COMPLETE [${requestId}] SUCCESS sessionId=${session.sessionId} code=${code} deviceId=${device.id} duration=${duration}ms`);
      recordComplete();

      // Broadcast events (non-blocking, don't fail if broadcast fails)
      try {
        broadcast('pair.bound', {
          deviceId: device.id,
          screenId: device.id, // Backward compatibility
          sessionId: session.sessionId,
          code: session.code,
        });

        broadcast('pairing_completed', {
          type: 'pairing_completed',
          sessionId: session.sessionId,
          device: {
            id: device.id,
            name: device.name || null,
            location: device.location || null,
          },
        }, { key: 'admin' });

        // Also broadcast device:paired event for Device Engine compatibility
        broadcast('device:paired', {
          deviceId: device.id,
          name: device.name,
          platform: device.platform || null,
          type: device.type || 'screen',
          status: device.status,
          lastSeenAt: device.lastSeenAt?.toISOString() || null,
        }, { key: 'admin' });
      } catch (broadcastError) {
        console.warn('[PAIR] COMPLETE broadcast error (non-fatal):', broadcastError);
      }

      return res.json({
        ok: true,
        deviceId: device.id, // NEW: Return deviceId
        screenId: device.id, // Backward compatibility
        token,
        session: {
          sessionId: updatedSession.sessionId,
          code: updatedSession.code,
          status: 'bound',
          expiresAt: expiresAtDate.toISOString(),
          fingerprint: updatedSession.fingerprint,
          model: updatedSession.model,
          name: updatedSession.name,
          location: updatedSession.location || null,
        },
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[PAIR] COMPLETE [${requestId}] UNEXPECTED ERROR after ${duration}ms:`, error);
      console.error(`[PAIR] COMPLETE [${requestId}] Error stack:`, error.stack);
      // Ensure we always return a JSON response
      if (!res.headersSent) {
        return res.status(500).json({ 
          ok: false, 
          error: 'internal_server_error',
          message: 'An unexpected error occurred',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
      }
      return next(error);
    }
  }
);

// POST /api/screens/:screenId/repair/complete - Repair/re-pair an existing screen
// Used when a screen needs to be re-paired with a new device (e.g., device was replaced)
// Request: { sessionId: string } or { code: string }
// Response: { ok: true, screenId: string, token: string, session: {...} }
// Errors: 400 { ok: false, error: "..." }
// Rate limit: 20 requests per minute per IP
router.post('/screens/:screenId/repair/complete',
  rateLimit({ windowMs: 60 * 1000, max: 20 }), // 20 requests per minute
  async (req, res, next) => {
    try {
      const { screenId } = req.params;
      const sessionId = req.body?.sessionId ? String(req.body.sessionId).trim() : null;
      const code = req.body?.code ? String(req.body.code).trim().toUpperCase() : null;

      if (!sessionId && !code) {
        return res.status(400).json({ 
          ok: false, 
          error: 'session_identifier_required',
          message: 'Either sessionId or code must be provided',
        });
      }

      console.log(`[REPAIR] START screenId=${screenId} sessionId=${sessionId || 'null'} code=${code || 'null'}`);

      // Expire sessions before checking
      await expireSessions();

      // Look up the pairing session
      let session = null;
      if (sessionId) {
        session = await getPairSession(sessionId);
      } else if (code) {
        session = await findByCode(code);
      }

      if (!session) {
        console.log(`[REPAIR] FAILED: Session not found sessionId=${sessionId || 'null'} code=${code || 'null'}`);
        return res.status(400).json({ 
          ok: false, 
          error: 'invalid_or_expired_session',
          message: 'Session not found or expired',
        });
      }

      // Check if expired
      const expiresAtDate = new Date(session.expiresAt);
      const ttlLeftMs = Math.max(0, expiresAtDate.getTime() - Date.now());
      if (session.status === 'expired' || ttlLeftMs <= 0) {
        if (session.status !== 'expired') {
          await updatePairSession(session.sessionId, 'expired');
        }
        console.log(`[REPAIR] FAILED: Session expired sessionId=${session.sessionId}`);
        return res.status(400).json({ 
          ok: false, 
          error: 'invalid_or_expired_session',
          message: 'Session has expired',
        });
      }

      // Validate session status - must be showing_code or claimed (not already bound to another screen)
      if (session.status === 'bound') {
        // If already bound, check if it's bound to the same screen (idempotent)
        if (session.screenId === screenId && session.deviceToken) {
          const existingScreen = await prisma.screen.findUnique({
            where: { id: screenId },
          });
          if (existingScreen) {
            console.log(`[REPAIR] COMPLETE (idempotent): Session already bound to target screen sessionId=${session.sessionId} screenId=${screenId}`);
            return res.json({
              ok: true,
              screenId: screenId,
              token: session.deviceToken,
              session: {
                sessionId: session.sessionId,
                code: session.code,
                status: 'bound',
                expiresAt: expiresAtDate.toISOString(),
                fingerprint: session.fingerprint,
                model: session.model,
                name: session.name,
                location: session.location || null,
              },
            });
          }
        } else {
          // Bound to a different screen - this is an error
          console.log(`[REPAIR] FAILED: Session already bound to different screen sessionId=${session.sessionId} boundTo=${session.screenId} target=${screenId}`);
          return res.status(400).json({
            ok: false,
            error: 'session_already_bound',
            message: `Session is already bound to screen ${session.screenId}`,
            boundScreenId: session.screenId,
          });
        }
      }

      // Must be in showing_code or claimed status to repair
      if (session.status !== 'showing_code' && session.status !== 'claimed') {
        console.log(`[REPAIR] FAILED: Invalid session status sessionId=${session.sessionId} status=${session.status}`);
        return res.status(400).json({
          ok: false,
          error: 'invalid_session_status',
          message: `Session status must be 'showing_code' or 'claimed', got '${session.status}'`,
          status: session.status,
        });
      }

      // Look up the target screen
      const targetScreen = await prisma.screen.findUnique({
        where: { id: screenId },
      });

      if (!targetScreen) {
        console.log(`[REPAIR] FAILED: Target screen not found screenId=${screenId}`);
        return res.status(404).json({
          ok: false,
          error: 'screen_not_found',
          message: `Screen ${screenId} not found`,
        });
      }

      // Check if there's a temporary/auto-created screen attached to the session
      if (session.screenId && session.screenId !== screenId) {
        const tempScreen = await prisma.screen.findUnique({
          where: { id: session.screenId },
        });
        if (tempScreen) {
          // Log warning but don't fail - we'll just leave it unused
          console.warn(`[REPAIR] WARNING: Session has temporary screen attached sessionId=${session.sessionId} tempScreenId=${session.screenId} targetScreenId=${screenId}`);
        }
      }

      // Update the target screen with device data from session
      const updatedScreen = await prisma.screen.update({
        where: { id: screenId },
        data: {
          fingerprint: session.fingerprint || targetScreen.fingerprint,
          name: session.name || targetScreen.name,
          location: session.location || targetScreen.location,
          paired: true,
          status: 'ONLINE',
          statusText: 'paired',
          lastSeen: new Date(),
        },
      });

      // Generate fresh token/deviceJwt
      const token = `${screenId}-${Math.random().toString(36).slice(2, 8)}`;

      // Get auth context (user/workspace) - adjust based on your auth middleware
      const claimedBy = JSON.stringify({
        userId: req.user?.id || null,
        workspaceId: req.workspace?.id || null,
        claimedAt: new Date().toISOString(),
        repair: true, // Mark as repair operation
      });

      // Update session to bound
      const updatedSession = await updatePairSession(session.sessionId, 'bound', {
        screenId: screenId,
        deviceToken: token,
        claimedBy,
        name: session.name || targetScreen.name,
        location: session.location || targetScreen.location,
      });

      console.log(`[REPAIR] COMPLETE sessionId=${session.sessionId} screenId=${screenId} token=${token.substring(0, 20)}...`);

      // Broadcast events
      broadcast('pair.bound', {
        screenId: screenId,
        sessionId: session.sessionId,
        code: session.code,
        repair: true,
      });

      broadcast('pairing_completed', {
        type: 'pairing_completed',
        sessionId: session.sessionId,
        screen: {
          id: screenId,
          name: updatedScreen.name || null,
          location: updatedScreen.location || null,
        },
        repair: true,
      }, { key: 'admin' });

      return res.json({
        ok: true,
        screenId: screenId,
        token,
        session: {
          sessionId: updatedSession.sessionId,
          code: updatedSession.code,
          status: 'bound',
          expiresAt: expiresAtDate.toISOString(),
          fingerprint: updatedSession.fingerprint,
          model: updatedSession.model,
          name: updatedSession.name,
          location: updatedSession.location || null,
        },
      });
    } catch (error) {
      console.error('[REPAIR] ERROR:', error);
      return next(error);
    }
    END FROZEN CODE */
  }
);

// DELETE /api/screens/:id - Soft delete a screen
router.delete('/screens/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const purge = req.query.purge === '1' || req.query.purge === 'true';
    
    await deleteScreen(id, { purgeMedia: purge });
    
    return res.json({ ok: true, id });
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({ ok: false, error: 'screen_not_found' });
    }
    return next(error);
  }
});

export default router;

