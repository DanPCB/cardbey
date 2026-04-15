// src/routes/player.js
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { resolvePublicUrl, fileExistsOnDisk, isCloudFrontUrl } from '../utils/publicUrl.js';
import { info, debug } from '../lib/logger.js';
import { getCachedPlaylist, setCachedPlaylist } from '../lib/playlistCache.js';
import path from 'path';

const router = Router();
const prisma = new PrismaClient();

// GET /api/player/config - Returns player configuration with playlist
router.get('/config', async (req, res) => {
  try {
    const screenId = req.query.screenId;
    const code = req.query.code;
    
    if (!screenId && !code) {
      return res.status(400).json({ error: 'Missing screenId or code' });
    }

    // Find screen by ID or pairing code (excluding soft-deleted)
    let screen;
    if (screenId) {
      screen = await prisma.screen.findFirst({
        where: {
          id: screenId,
          deletedAt: null,
        },
        include: {
          assignedPlaylist: {
            include: {
              items: {
                include: {
                  media: true
                },
                orderBy: { orderIndex: 'asc' }
              }
            }
          }
        }
      });
    } else if (code) {
      screen = await prisma.screen.findFirst({
        where: {
          pairingCode: code.toUpperCase(),
          deletedAt: null,
        },
        include: {
          assignedPlaylist: {
            include: {
              items: {
                include: {
                  media: true
                },
                orderBy: { orderIndex: 'asc' }
              }
            }
          }
        }
      });
    }

    if (!screen) {
      return res.status(404).json({ error: 'Screen not found' });
    }

    // If no playlist assigned
    if (!screen.assignedPlaylist) {
      return res.json({
        ok: true,
        screenId: screen.id,
        hasPlaylist: false,
        items: [],
        sseUrl: `/api/stream?key=${process.env.SSE_STREAM_KEY || process.env.TV_STREAM_KEY || 'admin'}`
      });
    }

    // Build playlist items array with absolute URLs and mediaType
    const playlist = screen.assignedPlaylist;
    const items = playlist.items
      // Check items - for CloudFront URLs, skip filesystem checks; for legacy local files, verify existence
      .filter((item) => {
        const media = item.media || {};
        const mediaUrl = media.url || '';
        
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
        
        // Legacy local file - check filesystem if DB flag is set
        if (media.missingFile === true) {
          const kind = (media.kind || 'IMAGE').toLowerCase();
          let fileExists = false;
          let checkedPath = '';
          
          if (kind === 'video' && media.optimizedUrl) {
            if (fileExistsOnDisk(media.optimizedUrl)) {
              fileExists = true;
              checkedPath = media.optimizedUrl;
            } else if (fileExistsOnDisk(media.url)) {
              fileExists = true;
              checkedPath = media.url;
            }
          } else {
            fileExists = fileExistsOnDisk(media.url);
            checkedPath = media.url;
          }
          
          if (fileExists) {
            // File exists but DB flag is wrong - clear it
            if (media.id) {
              prisma.media.update({
                where: { id: media.id },
                data: { missingFile: false },
              }).catch(() => {});
            }
            return true;
          } else {
            // Legacy local file is actually missing - skip it
            console.warn('[PLAYER] Skipping legacy local file (missing from disk)', {
              screenId: screen.id,
              playlistId: playlist.id,
              mediaId: media.id || 'unknown',
              path: checkedPath,
            });
            return false;
          }
        }
        
        return true;
      })
      .map((item, idx) => {
      // Prefer optimizedUrl for videos if available and optimized, fallback to original
      const isVideoItem = (item.media?.kind || '').toUpperCase() === 'VIDEO';
      const originalUrl = item.media?.url || '';
      let fileStatus = 'OK';
      
      const isOriginalCloudFront = isCloudFrontUrl(originalUrl);
      const isOptimizedCloudFront = item.media?.optimizedUrl && isCloudFrontUrl(item.media.optimizedUrl);
      
      let mediaUrl;
      if (isVideoItem) {
        // Use optimized URL if available and optimization is complete
        if (item.media?.optimizedUrl && item.media?.isOptimized === true) {
          if (isOptimizedCloudFront) {
            // CloudFront optimized URL - use it directly
            mediaUrl = item.media.optimizedUrl;
            console.log(`[PLAYER] Using optimized video for asset ${item.media?.id || 'unknown'}`);
          } else if (fileExistsOnDisk(item.media.optimizedUrl)) {
            // Legacy local optimized file exists
            mediaUrl = item.media.optimizedUrl;
            console.log(`[PLAYER] Using optimized video for asset ${item.media?.id || 'unknown'}`);
          } else {
            // Optimized URL set but file missing - fallback to original
            console.warn(`[PLAYER] Optimized video missing, falling back to original for asset ${item.media?.id || 'unknown'}`);
            mediaUrl = originalUrl;
          }
        } else if (item.media?.optimizedUrl) {
          // optimizedUrl exists but isOptimized=false (optimization in progress)
          console.log(`[PLAYER] Using original video for asset ${item.media?.id || 'unknown'} (optimization pending)`);
          mediaUrl = originalUrl;
        } else {
          // No optimized URL yet
          mediaUrl = originalUrl;
          console.log(`[PLAYER] Using original video for asset ${item.media?.id || 'unknown'} (no optimized version)`);
        }
      } else {
        mediaUrl = originalUrl;
      }
      
      // For legacy local files, verify existence; CloudFront URLs are always OK
      if (!isCloudFrontUrl(mediaUrl) && mediaUrl && !fileExistsOnDisk(mediaUrl)) {
        console.warn('[PLAYER] ⚠️ Legacy local file missing:', {
          screenId: screen.id,
          playlistId: playlist.id,
          mediaId: item.media?.id || 'unknown',
          path: mediaUrl,
        });
        fileStatus = 'MISSING_FILE';
        
        if (item.media?.id) {
          prisma.media.update({
            where: { id: item.media.id },
            data: { missingFile: true },
          }).catch(() => {});
        }
      }
      
      // CloudFront URLs are already absolute; legacy local paths need resolution
      mediaUrl = isCloudFrontUrl(mediaUrl) ? mediaUrl : resolvePublicUrl(mediaUrl, req);

      // Infer mediaType (mime) - ensure videos use video/mp4
      let mediaType = item.media?.mime || '';
      if (!mediaType) {
        const lower = (mediaUrl || '').toLowerCase();
        if (lower.endsWith('.mp4')) mediaType = 'video/mp4';
        else if (lower.endsWith('.webm')) mediaType = 'video/webm';
        else if (lower.endsWith('.mov')) mediaType = 'video/quicktime';
        else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) mediaType = 'image/jpeg';
        else if (lower.endsWith('.png')) mediaType = 'image/png';
        else if (lower.endsWith('.gif')) mediaType = 'image/gif';
      }
      
      // For videos, ensure mimeType is video/mp4 (standard for streaming)
      if (isVideoItem && !mediaType) {
        mediaType = 'video/mp4';
      }

      const isVideo = isVideoItem || (mediaType || '').startsWith('video/');
      return {
        // New, device-friendly fields
        id: item.id,
        url: mediaUrl,
        mediaType: mediaType || (isVideo ? 'video/mp4' : undefined),
        durationMs: Math.max(1, Number(item.durationS || 8)) * 1000,
        order: item.orderIndex ?? idx,
        // Legacy/preview-friendly fields (backward compatibility)
        type: isVideo ? 'video' : 'image',
        durationSec: item.durationS,
        fit: item.fit || 'cover',
        mute: item.muted,
        volume: item.muted ? 0 : 100,
        loop: item.loop,
        // Add status flag for missing files so UI can handle them appropriately
        status: fileStatus,
      };
    })
    .filter(item => item.url) // Must have a URL
    .filter(item => item.status !== 'MISSING_FILE'); // Exclude missing files from playlist (players can't play them)

    // Count items
    const videoCount = items.filter(item => item.type === 'video').length;
    const imageCount = items.filter(item => item.type === 'image').length;
    const usingOptimizedCount = items.filter(item => {
      const playlistItem = playlist.items.find(it => {
        const media = it.media || {};
        const itemUrl = item.url;
        return media.optimizedUrl && itemUrl && itemUrl.includes(media.optimizedUrl.split('/').pop());
      });
      return playlistItem?.media?.isOptimized === true;
    }).length;
    const usingOriginalCount = items.length - usingOptimizedCount;

    // Log playlist built
    info('PLAYLIST', 'Playlist built', {
      screenId: screen.id,
      playlistId: playlist.id,
      itemCount: items.length,
      videoCount,
      imageCount,
      usingOptimizedCount,
      usingOriginalCount,
      requestId,
    });

    // Use updatedAt as version for change detection
    const version = playlist.updatedAt ? new Date(playlist.updatedAt).toISOString() : '0';

    const responseData = {
      ok: true,
      screenId: screen.id,
      assignedPlaylistId: playlist.id,
      hasPlaylist: true,
      playlist: {
        id: playlist.id,
        name: playlist.name,
        version,
        items
      },
      sseUrl: '/api/stream?key=admin'
    };
    
    // Cache the response
    if (screenId) {
      setCachedPlaylist(screenId, { full: true }, responseData);
    }

    res.json(responseData);
  } catch (e) {
    console.error('[PlayerConfig] Error:', e);
    res.status(500).json({ error: 'Failed to load player config' });
  }
});

export default router;



