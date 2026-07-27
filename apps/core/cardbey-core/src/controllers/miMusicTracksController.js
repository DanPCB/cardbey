/**
 * MI Music Tracks Controller
 * Handles requests for MI music track catalog
 */

import prisma from '../lib/prisma.js';

/**
 * GET /api/mi/music-tracks
 * List all active music tracks with optional filtering
 */
export async function handleListMiMusicTracks(req, res, next) {
  try {
    const { category, isActive } = req.query;

    // Check if MiMusicTrack model exists
    if (!prisma.miMusicTrack) {
      return res.status(503).json({
        ok: false,
        error: 'model_not_available',
        message: 'MiMusicTrack model not available. Please run: npx prisma generate && npx prisma migrate dev',
      });
    }

    // Build where clause
    const where = {};
    if (category) {
      where.category = category;
    }
    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    } else {
      // Default to active tracks only
      where.isActive = true;
    }

    const tracks = await prisma.miMusicTrack.findMany({
      where,
      orderBy: [
        { category: 'asc' },
        { name: 'asc' },
      ],
    });

    res.json({
      ok: true,
      tracks,
    });
  } catch (error) {
    console.error('[MI Music Tracks] List error:', error);
    next(error);
  }
}

/**
 * GET /api/mi/music-tracks/:key
 * Get a specific music track by key
 */
export async function handleGetMiMusicTrack(req, res, next) {
  try {
    const { key } = req.params;

    if (!key) {
      return res.status(400).json({
        ok: false,
        error: 'missing_key',
        message: 'Music track key is required',
      });
    }

    // Check if MiMusicTrack model exists
    if (!prisma.miMusicTrack) {
      return res.status(503).json({
        ok: false,
        error: 'model_not_available',
        message: 'MiMusicTrack model not available. Please run: npx prisma generate && npx prisma migrate dev',
      });
    }

    const track = await prisma.miMusicTrack.findUnique({
      where: { key },
    });

    if (!track) {
      return res.status(404).json({
        ok: false,
        error: 'track_not_found',
        message: 'Music track not found',
      });
    }

    res.json({
      ok: true,
      track,
    });
  } catch (error) {
    console.error('[MI Music Tracks] Get error:', error);
    next(error);
  }
}

