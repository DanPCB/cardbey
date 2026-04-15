/**
 * Signage Engine API Routes
 * Exposes signage engine tools as HTTP endpoints
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth.js';
import { getEventEmitter } from '../engines/signage/events.js';
import {
  createPlaylist,
  addAssetsToPlaylist,
  schedulePlaylist,
  publishToDevices,
  generateFromMenu,
  queryDevicePlaylist,
} from '../engines/signage/index.js';
import {
  CreatePlaylistInput,
  AddAssetsToPlaylistInput,
  SchedulePlaylistInput,
  PublishToDevicesInput,
  GenerateFromMenuInput,
  QueryDevicePlaylistInput,
} from '../engines/signage/types.js';

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
      // TODO: Add images, devices services when available
    },
  };
}

/**
 * POST /api/signage/engine/build-playlist
 * Build a new signage playlist
 */
router.post('/build-playlist', requireAuth, async (req, res) => {
  try {
    const parsed = CreatePlaylistInput.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid input',
        issues: parsed.error.issues,
      });
    }

    const input = parsed.data;
    const ctx = createEngineContext();

    // Create playlist
    const result = await createPlaylist(input, ctx);

    if (!result.ok) {
      return res.status(400).json(result);
    }

    // Optionally add assets if provided
    let items = null;
    if (req.body.contentIds && Array.isArray(req.body.contentIds) && req.body.contentIds.length > 0) {
      // TODO: Convert contentIds to assets and add to playlist
      // For now, return playlist ID for manual asset addition
    }

    res.json({
      ok: true,
      data: {
        playlistId: result.data.playlistId,
        items,
        summary: {
          name: input.name,
          description: input.description,
          type: 'SIGNAGE',
        },
      },
    });
  } catch (error) {
    console.error('[Signage Engine] Build playlist error:', error);
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to build playlist',
    });
  }
});

/**
 * POST /api/signage/engine/add-assets
 * Add assets to an existing playlist
 */
router.post('/add-assets', requireAuth, async (req, res) => {
  try {
    const parsed = AddAssetsToPlaylistInput.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid input',
        issues: parsed.error.issues,
      });
    }

    const input = parsed.data;
    const ctx = createEngineContext();

    const result = await addAssetsToPlaylist(input, ctx);

    if (!result.ok) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('[Signage Engine] Add assets error:', error);
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to add assets',
    });
  }
});

/**
 * POST /api/signage/engine/apply-schedule
 * Schedule a playlist to devices
 */
router.post('/apply-schedule', requireAuth, async (req, res) => {
  try {
    const parsed = SchedulePlaylistInput.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid input',
        issues: parsed.error.issues,
      });
    }

    const input = parsed.data;
    const ctx = createEngineContext();

    const result = await schedulePlaylist(input, ctx);

    if (!result.ok) {
      return res.status(400).json(result);
    }

    res.json({
      ok: true,
      data: {
        scheduleId: result.data.scheduleId,
        summary: {
          playlistId: input.playlistId,
          deviceId: input.deviceId,
          deviceGroupId: input.deviceGroupId,
          startAt: input.startAt,
          endAt: input.endAt,
        },
      },
    });
  } catch (error) {
    console.error('[Signage Engine] Apply schedule error:', error);
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to apply schedule',
    });
  }
});

/**
 * POST /api/signage/engine/publish
 * Publish playlists to devices
 */
router.post('/publish', requireAuth, async (req, res) => {
  try {
    const parsed = PublishToDevicesInput.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid input',
        issues: parsed.error.issues,
      });
    }

    const input = parsed.data;
    const ctx = createEngineContext();

    const result = await publishToDevices(input, ctx);

    if (!result.ok) {
      return res.status(400).json(result);
    }

    res.json({
      ok: true,
      data: {
        devicesUpdated: result.data.devicesUpdated,
        summary: {
          tenantId: input.tenantId,
          storeId: input.storeId,
          playlistId: input.playlistId || 'all',
        },
      },
    });
  } catch (error) {
    console.error('[Signage Engine] Publish error:', error);
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to publish to devices',
    });
  }
});

/**
 * POST /api/signage/engine/generate-from-menu
 * Generate signage assets from menu items
 */
router.post('/generate-from-menu', requireAuth, async (req, res) => {
  try {
    const parsed = GenerateFromMenuInput.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid input',
        issues: parsed.error.issues,
      });
    }

    const input = parsed.data;
    const ctx = createEngineContext();

    const result = await generateFromMenu(input, ctx);

    if (!result.ok) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('[Signage Engine] Generate from menu error:', error);
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to generate from menu',
    });
  }
});

/**
 * GET /api/signage/engine/device-playlist
 * Query current playlist for a device
 */
router.get('/device-playlist', requireAuth, async (req, res) => {
  try {
    const parsed = QueryDevicePlaylistInput.safeParse({
      tenantId: req.query.tenantId || req.user?.tenantId,
      storeId: req.query.storeId,
      deviceId: req.query.deviceId,
    });

    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid input',
        issues: parsed.error.issues,
      });
    }

    const input = parsed.data;
    const ctx = createEngineContext();

    const result = await queryDevicePlaylist(input, ctx);

    if (!result.ok) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('[Signage Engine] Query device playlist error:', error);
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to query device playlist',
    });
  }
});

/**
 * GET /api/signage/engine/playlists
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
    console.error('[Signage Engine] Get playlists error:', error);
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

