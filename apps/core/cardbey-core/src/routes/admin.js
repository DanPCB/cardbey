// src/routes/admin.js
// Admin-only endpoints for maintenance and diagnostics

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { scanMissingMedia } from '../../scripts/scan-missing-media-runner.js';
import { runCleanup } from '../services/s3Cleanup.js';

const router = Router();
const prisma = new PrismaClient();

// All admin routes require auth + platform admin role
router.use(requireAuth);
router.use(requireAdmin);

/**
 * GET /api/admin/health — quick verification that caller is platform admin
 */
router.get('/health', (req, res) => {
  res.json({ ok: true, role: req.user?.role });
});

/**
 * POST /api/admin/scan-missing-media
 * Trigger a scan to find and flag missing media files
 * Requires admin authentication
 */
router.post('/scan-missing-media', async (req, res) => {
  try {
    console.log('[ADMIN] Scan missing media requested by', req.ip);
    
    // Run the scanner
    const result = await scanMissingMedia();
    
    return res.json({
      ok: true,
      message: 'Scan completed successfully',
      result: {
        totalChecked: result.totalChecked,
        markedMissing: result.markedMissing,
        clearedMissing: result.clearedMissing,
        optimizedCleared: result.optimizedCleared,
        duration: result.duration,
        currentMissingCount: result.currentMissingCount,
      },
    });
  } catch (error) {
    console.error('[ADMIN] Scan failed:', error);
    return res.status(500).json({
      ok: false,
      error: 'Scan failed',
      message: error.message,
    });
  }
});

/**
 * GET /api/admin/media-stats
 * Get statistics about media files (total, missing, etc.)
 */
router.get('/media-stats', async (req, res) => {
  try {
    const [totalMedia, missingMedia, totalPlaylists, playlistsWithMissing] = await Promise.all([
      prisma.media.count(),
      prisma.media.count({ where: { missingFile: true } }),
      prisma.playlist.count(),
      prisma.playlist.count({
        where: {
          items: {
            some: {
              media: {
                missingFile: true,
              },
            },
          },
        },
      }),
    ]);
    
    return res.json({
      ok: true,
      stats: {
        totalMedia,
        missingMedia,
        validMedia: totalMedia - missingMedia,
        totalPlaylists,
        playlistsWithMissing,
      },
    });
  } catch (error) {
    console.error('[ADMIN] Failed to get media stats:', error);
    return res.status(500).json({
      ok: false,
      error: 'Failed to get stats',
      message: error.message,
    });
  }
});

/**
 * GET /api/admin/missing-media
 * Get list of all missing media files with details
 */
router.get('/missing-media', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const offset = Number(req.query.offset) || 0;
    
    const missingMedia = await prisma.media.findMany({
      where: { missingFile: true },
      include: {
        items: {
          include: {
            playlist: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
    
    const total = await prisma.media.count({ where: { missingFile: true } });
    
    // Format response with playlist info
    const formatted = missingMedia.map(media => ({
      id: media.id,
      url: media.url,
      optimizedUrl: media.optimizedUrl,
      kind: media.kind,
      mime: media.mime,
      createdAt: media.createdAt,
      usedInPlaylists: media.items.map(item => ({
        playlistId: item.playlist.id,
        playlistName: item.playlist.name,
        itemId: item.id,
      })),
    }));
    
    return res.json({
      ok: true,
      items: formatted,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('[ADMIN] Failed to get missing media:', error);
    return res.status(500).json({
      ok: false,
      error: 'Failed to get missing media',
      message: error.message,
    });
  }
});

/**
 * POST /api/admin/s3-cleanup
 * Trigger S3 cleanup (delete original videos with optimized versions, unused assets)
 * Query params:
 *   - dryRun=true (optional) - Don't actually delete, just log what would be deleted
 *   - deleteOriginalAfterDays=N (optional) - Days to wait before deleting original videos (default: 30)
 *   - deleteUnusedAfterDays=N (optional) - Days to wait before deleting unused assets (default: 90)
 */
router.post('/s3-cleanup', async (req, res) => {
  try {
    const options = {
      dryRun: req.query.dryRun === 'true' || req.body.dryRun === true,
      deleteOriginalAfterDays: req.query.deleteOriginalAfterDays 
        ? parseInt(req.query.deleteOriginalAfterDays, 10)
        : req.body.deleteOriginalAfterDays,
      deleteUnusedAfterDays: req.query.deleteUnusedAfterDays
        ? parseInt(req.query.deleteUnusedAfterDays, 10)
        : req.body.deleteUnusedAfterDays,
    };
    
    // Run cleanup
    const result = await runCleanup(options);
    
    return res.json({
      ok: true,
      message: options.dryRun ? 'Cleanup simulation completed' : 'Cleanup completed',
      result,
    });
  } catch (error) {
    console.error('[ADMIN] S3 cleanup failed:', error);
    return res.status(500).json({
      ok: false,
      error: 'Cleanup failed',
      message: error.message,
    });
  }
});

export default router;

