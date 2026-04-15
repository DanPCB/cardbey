/**
 * Signage Test Routes
 * Dev-only endpoints for testing Signage + Device Engine integration
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth.js';
import { pushPlaylist } from '../engines/device/index.js';
import { getEventEmitter } from '../engines/device/events.js';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * Create engine context with services
 */
function createEngineContext() {
  return {
    services: {
      db: prisma,
      events: getEventEmitter(),
      // Device service will be null, but pushPlaylist handles that
    },
  };
}

/**
 * Test video URL for dev testing
 */
const TEST_VIDEO_URL = 'https://www.w3schools.com/html/mov_bbb.mp4';

/**
 * POST /api/signage/test-playlist
 * Create a test playlist and push it to devices
 */
router.post('/test-playlist', async (req, res) => {
  try {
    const { tenantId, storeId, deviceId } = req.body;

    console.log('[TEST SIGNAGE] Creating test playlist for', tenantId, storeId);

    // Validate input
    if (!tenantId || !storeId) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required fields',
        message: 'tenantId and storeId are required',
      });
    }

    // Find target devices
    let devices = [];
    if (deviceId) {
      const device = await prisma.device.findFirst({
        where: { id: deviceId, tenantId, storeId },
      });
      if (!device) {
        return res.status(400).json({
          ok: false,
          error: 'Device not found',
          message: `Device ${deviceId} not found for this tenant/store`,
        });
      }
      devices = [device];
    } else {
      devices = await prisma.device.findMany({
        where: { tenantId, storeId, status: 'online' },
      });

      if (devices.length === 0) {
        return res.status(400).json({
          ok: false,
          error: 'No online devices',
          message: 'No online devices found for this store',
        });
      }
    }

    // Create or reuse test SignageAsset
    let asset = await prisma.signageAsset.findFirst({
      where: { tenantId, storeId, url: TEST_VIDEO_URL },
    });

    if (!asset) {
      asset = await prisma.signageAsset.create({
        data: {
          tenantId,
          storeId,
          type: 'video',
          url: TEST_VIDEO_URL,
          durationS: 20,
          tags: 'dev,test',
        },
      });
    }

    // Create or reuse test Playlist
    let playlist = await prisma.playlist.findFirst({
      where: {
        tenantId,
        storeId,
        name: 'C-Net Test Loop',
        type: 'SIGNAGE',
      },
    });

    if (!playlist) {
      playlist = await prisma.playlist.create({
        data: {
          tenantId,
          storeId,
          name: 'C-Net Test Loop',
          description: 'Dev test playlist for C-Net devices',
          type: 'SIGNAGE',
          active: true,
        },
      });
    }

    // Ensure PlaylistItem exists for this asset
    const existingItem = await prisma.playlistItem.findFirst({
      where: { playlistId: playlist.id, assetId: asset.id },
    });

    if (!existingItem) {
      const count = await prisma.playlistItem.count({
        where: { playlistId: playlist.id },
      });
      await prisma.playlistItem.create({
        data: {
          playlistId: playlist.id,
          assetId: asset.id,
          orderIndex: count,
          durationS: asset.durationS,
        },
      });
    }

    // Get playlist items with assets for compilation
    const playlistItems = await prisma.playlistItem.findMany({
      where: { playlistId: playlist.id },
      include: { asset: true },
      orderBy: { orderIndex: 'asc' },
    });

    // Compile playlist data
    const playlistData = {
      items: playlistItems.map((item) => ({
        assetId: item.assetId,
        url: item.asset.url,
        type: item.asset.type,
        duration: item.durationS || item.asset.durationS,
        order: item.orderIndex,
      })),
    };

    // Push playlist to each device
    const version = `${playlist.id}:${Date.now()}`;
    const ctx = createEngineContext();

    for (const device of devices) {
      try {
        await pushPlaylist(
          {
            tenantId,
            storeId,
            deviceId: device.id,
            playlistId: playlist.id,
            playlistData,
            version,
          },
          ctx
        );
      } catch (error) {
        console.error(
          `[TEST SIGNAGE] Failed to push playlist to device ${device.id}:`,
          error
        );
        // Continue with other devices
      }
    }

    console.log(
      `[TEST SIGNAGE] Pushed playlist ${playlist.id} to ${devices.length} devices`
    );

    res.json({
      ok: true,
      data: {
        playlistId: playlist.id,
        assetUrl: asset.url,
        deviceCount: devices.length,
        devices: devices.map((d) => ({ id: d.id, name: d.name })),
      },
    });
  } catch (error) {
    console.error('[TEST SIGNAGE] Error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to create test playlist',
    });
  }
});

/**
 * GET /api/signage/playlists
 * List all SIGNAGE playlists for a store
 * Query params:
 *   - storeId: string (required)
 *   - tenantId: string (optional, can come from auth)
 *   - limit: number (optional, default 50, max 100)
 *   - offset: number (optional, default 0)
 *   - active: boolean (optional, filter by active status)
 * 
 * Response:
 *   {
 *     ok: true,
 *     items: Array<{
 *       id: string,
 *       name: string,
 *       description: string | null,
 *       active: boolean,
 *       itemCount: number,
 *       createdAt: string,
 *       updatedAt: string
 *     }>,
 *     total: number
 *   }
 */
router.get('/playlists', requireAuth, async (req, res) => {
  try {
    const storeId = req.query.storeId || req.user?.business?.storeId || req.workspace?.storeId;
    const tenantId = req.query.tenantId || req.user?.business?.tenantId || req.workspace?.tenantId;
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;
    const active = req.query.active !== undefined ? req.query.active === 'true' : undefined;

    if (!storeId) {
      return res.status(400).json({
        ok: false,
        error: 'missing_storeId',
        message: 'storeId is required (can come from query param or auth context)',
      });
    }

    console.log('[Signage] GET /api/signage/playlists', {
      storeId,
      tenantId,
      limit,
      offset,
      active,
    });

    // Build where clause
    const where = {
      type: 'SIGNAGE',
      storeId,
    };

    if (tenantId) {
      where.tenantId = tenantId;
    }

    if (active !== undefined) {
      where.active = active;
    }

    // Get total count
    const total = await prisma.playlist.count({ where });

    // Get playlists with item counts
    const playlists = await prisma.playlist.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        items: {
          select: {
            id: true,
          },
        },
      },
    });

    // Format response
    const items = playlists.map(playlist => ({
      id: playlist.id,
      name: playlist.name,
      description: playlist.description,
      active: playlist.active,
      itemCount: playlist.items.length,
      createdAt: playlist.createdAt.toISOString(),
      updatedAt: playlist.updatedAt.toISOString(),
    }));

    console.log('[Signage] Found playlists', {
      storeId,
      count: items.length,
      total,
    });

    res.json({
      ok: true,
      items,
      total,
    });
  } catch (error) {
    console.error('[Signage] Get playlists error:', error);
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to fetch playlists',
    });
  }
});

/**
 * POST /api/signage/create-playlist
 * Create a new SignagePlaylist (Playlist with type='SIGNAGE')
 * 
 * Request body:
 *   - tenantId: string (required)
 *   - storeId: string (required)
 *   - name: string (required)
 *   - description: string | null (optional)
 *   - defaultDuration: number | null (optional, in seconds)
 * 
 * Response:
 *   {
 *     ok: true,
 *     data: {
 *       playlist: {
 *         id: string,
 *         name: string,
 *         description: string | null,
 *         active: boolean,
 *         createdAt: ISO string,
 *         updatedAt: ISO string
 *       }
 *     }
 *   }
 */
router.post('/create-playlist', requireAuth, async (req, res) => {
  const requestId = Math.random().toString(36).slice(2, 9);
  
  try {
    const { tenantId, storeId, name, description, defaultDuration } = req.body;
    
    console.log(`[Signage] [${requestId}] POST /api/signage/create-playlist`, {
      tenantId,
      storeId,
      name,
      hasDescription: !!description,
      defaultDuration,
    });
    
    // Validate required fields
    if (!tenantId || !storeId || !name) {
      return res.status(400).json({
        ok: false,
        error: 'missing_required_fields',
        message: 'tenantId, storeId, and name are required',
      });
    }
    
    // Validate name is not empty
    if (typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({
        ok: false,
        error: 'invalid_name',
        message: 'name must be a non-empty string',
      });
    }
    
    // Create SignagePlaylist (Playlist with type='SIGNAGE')
    const playlist = await prisma.playlist.create({
      data: {
        type: 'SIGNAGE',
        tenantId: String(tenantId),
        storeId: String(storeId),
        name: name.trim(),
        description: description && typeof description === 'string' ? description.trim() || null : null,
        active: true,
      },
    });
    
    console.log(`[Signage] [${requestId}] Created SignagePlaylist:`, {
      playlistId: playlist.id,
      name: playlist.name,
      tenantId: playlist.tenantId,
      storeId: playlist.storeId,
    });
    
    // Emit event for real-time updates
    try {
      const { broadcast } = await import('../realtime/sse.js');
      broadcast('signage:playlist_created', {
        playlistId: playlist.id,
        tenantId: playlist.tenantId,
        storeId: playlist.storeId,
        name: playlist.name,
        at: new Date().toISOString(),
      }, { key: 'admin' });
    } catch (broadcastError) {
      console.warn(`[Signage] [${requestId}] Failed to broadcast event (non-fatal):`, broadcastError.message);
    }
    
    res.json({
      ok: true,
      data: {
        playlist: {
          id: playlist.id,
          name: playlist.name,
          description: playlist.description,
          active: playlist.active,
          createdAt: playlist.createdAt.toISOString(),
          updatedAt: playlist.updatedAt.toISOString(),
        },
      },
    });
  } catch (error) {
    console.error(`[Signage] [${requestId}] Create playlist error:`, {
      error: error.message,
      stack: error.stack,
    });
    
    res.status(500).json({
      ok: false,
      error: 'internal_error',
      message: error.message || 'Failed to create playlist',
    });
  }
});

export default router;


