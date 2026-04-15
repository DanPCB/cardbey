// src/routes/playlists.js
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { rateLimit } from '../middleware/rateLimit.js';
import { fileExistsOnDisk } from '../utils/publicUrl.js';

const router = Router();
const prisma = new PrismaClient();

// Debounce map to prevent rapid-fire broadcasts
const broadcastDebounce = new Map();
const BROADCAST_DEBOUNCE_MS = 1000; // Wait 1 second before broadcasting

// GET /api/playlists - List all playlists
// Query: limit, offset, q?
// Response: { ok: true, items: [...], total: number }
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;
    const q = req.query.q ? String(req.query.q).trim() : null;

    const where = {};
    if (q) {
      // SQLite doesn't support case-insensitive mode, use contains for case-sensitive search
      // For case-insensitive, we'd need to use raw SQL or filter in memory
      where.name = {
        contains: q,
      };
    }
    // TODO: Consider filtering by type (MEDIA vs SIGNAGE) based on query param
    // For now, return all playlists for backward compatibility

    // Get total count
    const total = await prisma.playlist.count({ where });

    // Get playlists with pagination and item counts
    const playlists = await prisma.playlist.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        items: {
          include: {
            media: {
              select: {
                id: true,
                missingFile: true,
                url: true,
              },
            },
          },
        },
      },
    });
    
    // Calculate playable items for each playlist
    const playlistsWithStats = playlists.map(playlist => {
      let playableCount = 0;
      let missingCount = 0;
      
      for (const item of playlist.items || []) {
        const media = item.media || {};
        if (media.missingFile === true) {
          // Re-check file existence
          const fileExists = fileExistsOnDisk(media.url);
          if (fileExists) {
            playableCount++;
          } else {
            missingCount++;
          }
        } else {
          playableCount++;
        }
      }
      
      return {
        id: playlist.id,
        name: playlist.name,
        createdAt: playlist.createdAt,
        updatedAt: playlist.updatedAt,
        itemCount: playlist.items.length,
        playableItems: playableCount,
        missingItems: missingCount,
      };
    });

    res.json({
      ok: true,
      items: playlistsWithStats || [],
      total: total || 0,
    });
  } catch (e) {
    console.error('[playlists.routes] GET / error:', e);
    res.status(500).json({ ok: false, error: 'Failed to fetch playlists' });
  }
});

// Coerce numbers to integers (accepts strings, floats, etc.)
const IntFromAny = z.coerce.number().int();

const Item = z.object({
  mediaId: z.preprocess(
    (val) => {
      // Handle various input types and convert to string
      if (val === null || val === undefined || val === '') {
        return undefined; // Will trigger required error
      }
      const str = String(val).trim();
      return str.length > 0 ? str : undefined;
    },
    z.string().min(1, 'mediaId is required and must be a non-empty string')
  ).describe('The Media ID from an uploaded file (required)'),
  durationS: IntFromAny.min(1).default(8),
  orderIndex: IntFromAny.min(0),
  fit: z.string().default('cover'),
  muted: z.coerce.boolean().default(false),
  loop: z.coerce.boolean().default(false),
  displayOrientation: z.enum(['AUTO', 'LANDSCAPE', 'PORTRAIT', 'auto', 'landscape', 'portrait']).optional().transform((val) => {
    // Normalize to uppercase for database storage
    return val ? val.toUpperCase() : undefined;
  }),
});

const Create = z.object({
  name: z.string().min(1),
  items: z.array(Item).min(1),
});

// Helper for better error formatting
function zodError(res, error, reqBody = null) {
  if (error?.issues) {
    // Check if the error is about missing mediaId - provide helpful guidance
    const missingMediaIdError = error.issues.find(i => 
      i.path.includes('mediaId') && (i.message.includes('Required') || i.code === 'invalid_type')
    );
    
    let hint = null;
    if (missingMediaIdError && reqBody?.items?.[0]) {
      const firstItem = reqBody.items[0];
      const hasRenderSlides = reqBody?.renderSlides !== undefined;
      const hasContentFields = 'contentId' in firstItem || ('id' in firstItem && !('mediaId' in firstItem));
      
      if (hasRenderSlides || hasContentFields) {
        hint = 'It looks like you\'re trying to publish Content Studio designs. Content designs (canvas elements) cannot be added directly to playlists. You need to:\n\n1. Export/render your Content Studio design as an image or video\n2. Upload it as Media using the upload endpoint\n3. Use the returned Media ID when creating the playlist\n\nAlternatively, create an endpoint that automatically converts Content to Media when publishing.';
      } else {
        hint = 'Each playlist item must have a "mediaId" field containing the ID of an uploaded Media record (video or image). The items you sent are missing this required field.';
      }
    }
    
    const response = {
      ok: false,
      error: {
        message: 'Validation failed',
        issues: error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
          expected: i.expected,
          received: i.received,
        })),
      },
    };
    
    if (hint) {
      response.error.hint = hint;
    }
    
    // Add debugging info in development
    if (reqBody && process.env.NODE_ENV === 'development') {
      response.error.debug = {
        receivedBody: {
          keys: Object.keys(reqBody),
          itemsCount: Array.isArray(reqBody.items) ? reqBody.items.length : 0,
          firstItemKeys: reqBody.items?.[0] ? Object.keys(reqBody.items[0]) : null,
        },
      };
    }
    
    return res.status(400).json(response);
  }
  return res.status(400).json({ ok: false, error: 'Bad request' });
}

// POST /api/playlists - Create playlist
router.post('/', 
  rateLimit({ windowMs: 60 * 1000, max: 20 }), // 20 requests per minute per IP
  async (req, res) => {
  try {
    // Log request for debugging
    console.log('[PLAYLISTS] POST / - Request received:', {
      hasBody: !!req.body,
      bodyKeys: req.body ? Object.keys(req.body) : [],
      itemsCount: Array.isArray(req.body?.items) ? req.body.items.length : 0,
      firstItem: req.body?.items?.[0] ? {
        keys: Object.keys(req.body.items[0]),
        hasMediaId: 'mediaId' in req.body.items[0],
        mediaIdValue: req.body.items[0].mediaId,
        mediaIdType: typeof req.body.items[0].mediaId,
      } : null,
    });
    
    const parsed = Create.safeParse(req.body);
    if (!parsed.success) {
      console.error('[PLAYLISTS] Validation failed:', parsed.error.issues);
      return zodError(res, parsed.error, req.body);
    }

    const { name, items } = parsed.data;

    // Validate that all mediaIds exist before creating the playlist
    const mediaIds = items.map(i => i.mediaId);
    const uniqueMediaIds = [...new Set(mediaIds)]; // Remove duplicates
    
    const existingMedia = await prisma.media.findMany({
      where: { id: { in: uniqueMediaIds } },
      select: { id: true }
    });
    
    const existingMediaIds = new Set(existingMedia.map(m => m.id));
    const missingMediaIds = uniqueMediaIds.filter(id => !existingMediaIds.has(id));
    
    if (missingMediaIds.length > 0) {
      return res.status(400).json({
        ok: false,
        error: {
          message: 'One or more media items not found',
          missingMediaIds: missingMediaIds
        }
      });
    }

    for (const i of items) {
      console.log('[PlaylistItem] creating with mediaId:', i.mediaId, 'assetId:', i.assetId ?? null);
    }

    const playlist = await prisma.playlist.create({
      data: {
        type: 'MEDIA', // Explicitly set type for media playlists
        name,
        items: {
          create: items.map((i) => ({
            orderIndex: i.orderIndex,
            durationS: i.durationS,
            fit: i.fit,
            muted: i.muted,
            loop: i.loop,
            displayOrientation: i.displayOrientation || 'AUTO',
            media: { connect: { id: i.mediaId } },
          })),
        },
      },
      include: {
        items: {
          include: { media: true },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    // Broadcast playlist.updated event (debounced)
    // Note: For a newly created playlist, no screens will be using it yet,
    // but we still broadcast the generic event for any listeners
    debouncedBroadcast(playlist.id, null);

    res.status(201).json({ ok: true, data: playlist });
  } catch (e) {
    console.error('[playlists.routes] POST / error:', e);
    console.error('[playlists.routes] POST / error stack:', e?.stack);
    console.error('[playlists.routes] POST / error name:', e?.name);
    console.error('[playlists.routes] POST / error message:', e?.message);
    
    // Handle Prisma-specific errors
    if (e?.code === 'P2003') {
      // Foreign key constraint failed (shouldn't happen now with validation, but handle gracefully)
      return res.status(400).json({
        ok: false,
        error: {
          message: 'One or more media items not found',
          details: e.meta
        }
      });
    }
    
    if (e?.code === 'P2002') {
      // Unique constraint failed
      return res.status(409).json({
        ok: false,
        error: {
          message: 'Playlist with this name already exists',
          details: e.meta
        }
      });
    }
    
    // Generic error response
    const errorMessage = e instanceof Error ? e.message : String(e);
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    res.status(500).json({ 
      ok: false,
      error: 'Failed to create playlist',
      message: isDevelopment ? errorMessage : undefined,
      ...(isDevelopment && e?.stack ? { stack: e.stack } : {})
    });
  }
});

// GET /api/playlists/:id - Get single playlist (must be after POST /)
// Returns all items including those with missing files (for playlist editor)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`[playlists.routes] GET /:id id=${id}`);
    
    const playlist = await prisma.playlist.findUnique({
      where: { id },
      include: {
        items: {
          include: { media: true },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });
    
    if (!playlist) {
      console.log(`[playlists.routes] GET /:id id=${id} → 404 not found`);
      return res.status(404).json({ error: 'Not found' });
    }
    
    // Count missing files and verify file existence
    let missingCount = 0;
    let playableCount = 0;
    
    for (const item of playlist.items || []) {
      const media = item.media || {};
      if (media.missingFile === true) {
        // Re-check file existence - file may have been restored
        const fileExists = fileExistsOnDisk(media.url);
        
        if (fileExists) {
          // File exists but DB flag is wrong - will be cleared by playlist/full endpoint
          playableCount++;
        } else {
          missingCount++;
        }
      } else {
        playableCount++;
      }
    }
    
    if (missingCount > 0) {
      console.warn(`[playlists.routes] GET /:id id=${id} → ${missingCount} item(s) have missing files, ${playableCount} playable`);
    }
    
    console.log(`[playlists.routes] GET /:id id=${id} → ok items=${playlist.items?.length || 0} (${playableCount} playable, ${missingCount} missing)`);
    
    // Add metadata to response
    const response = {
      data: playlist,
      metadata: {
        totalItems: playlist.items?.length || 0,
        playableItems: playableCount,
        missingItems: missingCount,
      },
    };
    
    res.json(response);
  } catch (e) {
    console.error('[playlists.routes] GET /:id error:', e);
    res.status(500).json({ error: 'Failed to fetch playlist' });
  }
});

// PATCH /api/playlists/:id - Update playlist
router.patch('/:id', 
  rateLimit({ windowMs: 60 * 1000, max: 20 }), // 20 requests per minute per IP
  async (req, res) => {
  try {
    const { id } = req.params;
    const { name, items } = req.body || {};

    console.log(`[playlists.routes] PATCH /:id id=${id}`);

    // Check if playlist exists
    const existingPlaylist = await prisma.playlist.findUnique({
      where: { id },
      select: { id: true }
    });

    if (!existingPlaylist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    // Validate mediaIds if items are provided
    if (items && Array.isArray(items) && items.length > 0) {
      const mediaIds = items.map(i => i.mediaId).filter(Boolean);
      const uniqueMediaIds = [...new Set(mediaIds)]; // Remove duplicates
      
      if (uniqueMediaIds.length > 0) {
        const existingMedia = await prisma.media.findMany({
          where: { id: { in: uniqueMediaIds } },
          select: { id: true }
        });
        
        const existingMediaIds = new Set(existingMedia.map(m => m.id));
        const missingMediaIds = uniqueMediaIds.filter(mediaId => !existingMediaIds.has(mediaId));
        
        if (missingMediaIds.length > 0) {
          return res.status(400).json({
            error: {
              message: 'One or more media items not found',
              missingMediaIds: missingMediaIds
            }
          });
        }
      }
    }

    // Delete all existing items first
    await prisma.playlistItem.deleteMany({
      where: { playlistId: id }
    });

    for (const i of items || []) {
      console.log('[PlaylistItem] creating with mediaId:', i.mediaId, 'assetId:', i.assetId ?? null);
    }

    // Update playlist name and recreate items
    const playlist = await prisma.playlist.update({
      where: { id },
      data: {
        name: name || undefined,
        items: {
          create: (items || []).map((i, idx) => ({
            orderIndex: idx,
            durationS: i.durationS || 8,
            fit: i.fit || 'cover',
            muted: i.muted !== undefined ? i.muted : true,
            loop: i.loop || false,
            displayOrientation: i.displayOrientation || 'AUTO',
            media: { connect: { id: i.mediaId } },
          })),
        },
      },
      include: {
        items: {
          include: { media: true },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    // Broadcast playlist.updated event (debounced)
    // Find all screens assigned to this playlist and broadcast once
    const screensUsingPlaylist = await prisma.screen.findMany({
      where: {
        assignedPlaylistId: playlist.id,
        deletedAt: null,
      },
      select: { id: true }
    });
    
    debouncedBroadcast(playlist.id, screensUsingPlaylist.map(s => s.id));

    console.log(`[playlists.routes] PATCH /:id id=${id} → ok`);
    res.json({ data: playlist });
  } catch (e) {
    console.error('[playlists.routes] PATCH /:id error:', e);
    
    // Handle Prisma-specific errors
    if (e?.code === 'P2025') {
      // Record not found
      return res.status(404).json({ error: 'Playlist not found' });
    }
    
    if (e?.code === 'P2003') {
      // Foreign key constraint failed (shouldn't happen now with validation, but handle gracefully)
      return res.status(400).json({
        error: {
          message: 'One or more media items not found',
          details: e.meta
        }
      });
    }
    
    if (e?.code === 'P2002') {
      // Unique constraint failed
      return res.status(409).json({
        error: {
          message: 'Playlist with this name already exists',
          details: e.meta
        }
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to update playlist',
      message: process.env.NODE_ENV === 'development' ? e.message : undefined
    });
  }
});

// DELETE /api/playlists/:id - Delete playlist
router.delete('/:id', 
  rateLimit({ windowMs: 60 * 1000, max: 10 }), // 10 requests per minute per IP
  async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`[playlists.routes] DELETE /:id id=${id}`);

    // Delete playlist (cascade will delete items)
    await prisma.playlist.delete({
      where: { id }
    });

    // Broadcast playlist.updated event (debounced)
    // Find all screens assigned to this playlist before deletion
    const screensUsingPlaylist = await prisma.screen.findMany({
      where: {
        assignedPlaylistId: id,
        deletedAt: null,
      },
      select: { id: true }
    });
    
    debouncedBroadcast(id, screensUsingPlaylist.map(s => s.id));

    console.log(`[playlists.routes] DELETE /:id id=${id} → ok`);
    res.status(204).end();
  } catch (e) {
    console.error('[playlists.routes] DELETE /:id error:', e);
    if (e?.code === 'P2025') {
      return res.status(404).json({ error: 'Playlist not found' });
    }
    res.status(500).json({ error: 'Failed to delete playlist' });
  }
});

/**
 * Debounced broadcast function to prevent flooding
 * Only broadcasts once per playlistId within BROADCAST_DEBOUNCE_MS
 */
function debouncedBroadcast(playlistId, screenIds) {
  const key = `playlist-${playlistId}`;
  const now = Date.now();
  
  // Check if we already have a pending broadcast
  const existing = broadcastDebounce.get(key);
  if (existing) {
    // Update the screenIds to include all screens that need updates
    if (screenIds && existing.screenIds) {
      existing.screenIds = [...new Set([...existing.screenIds, ...screenIds])];
    } else if (screenIds) {
      existing.screenIds = screenIds;
    }
    // Reset the timer
    clearTimeout(existing.timeoutId);
    existing.timeoutId = setTimeout(() => {
      doBroadcast(playlistId, existing.screenIds);
      broadcastDebounce.delete(key);
    }, BROADCAST_DEBOUNCE_MS);
    return;
  }
  
  // Create new debounced broadcast
  const timeoutId = setTimeout(() => {
    doBroadcast(playlistId, screenIds);
    broadcastDebounce.delete(key);
  }, BROADCAST_DEBOUNCE_MS);
  
  broadcastDebounce.set(key, { timeoutId, screenIds, createdAt: now });
}

/**
 * Actually perform the broadcast
 */
async function doBroadcast(playlistId, screenIds) {
  try {
    const { broadcast } = await import('../realtime/sse.js');
    
    // Broadcast to specific screens if provided
    if (screenIds && screenIds.length > 0) {
      screenIds.forEach(screenId => {
        broadcast('playlist.updated', { 
          playlistId,
          screenId
        });
      });
      console.log(`[playlists.routes] Broadcast playlist.updated event for playlistId=${playlistId} to ${screenIds.length} screen(s)`);
    }
    
    // Always broadcast generic event (for backward compatibility)
    broadcast('playlist.updated', { playlistId });
    
  } catch (broadcastError) {
    console.error('[playlists.routes] Failed to broadcast playlist.updated:', broadcastError);
    // Don't fail the request if broadcast fails
  }
}

export default router;

