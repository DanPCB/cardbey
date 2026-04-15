/**
 * Trend Profiles Routes
 * 
 * REST endpoints for managing and querying Trend Profiles (style brains)
 * used by the AI Design Assistant.
 */

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

/**
 * GET /api/trends
 * List active trend profiles with optional filtering
 * 
 * Query params:
 * - goal: filter by goal (e.g. "poster", "story")
 * - search: substring match on name or slug
 * - include: "data" to include full data blob (default: false)
 */
router.get('/', async (req, res) => {
  try {
    const { goal, search, include } = req.query;

    // Build where clause
    const where = {
      isActive: true,
    };

    if (goal) {
      where.goal = goal;
    }

    if (search) {
      // SQLite doesn't support case-insensitive mode, so we'll filter in memory
      // For now, use case-sensitive contains (SQLite default)
      where.OR = [
        { name: { contains: search } },
        { slug: { contains: search } },
      ];
    }

    // Select fields - exclude data by default for smaller payload
    const select = include === 'data'
      ? undefined // Return all fields including data
      : {
          id: true,
          slug: true,
          name: true,
          season: true,
          goal: true,
          domain: true,
          isActive: true,
          weight: true,
          createdAt: true,
          updatedAt: true,
        };

    const trends = await prisma.trendProfile.findMany({
      where,
      select,
      orderBy: [
        { weight: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    res.json({
      ok: true,
      trends,
      count: trends.length,
    });
  } catch (error) {
    console.error('[Trends] List error:', error);
    res.status(500).json({
      ok: false,
      error: 'failed_to_list_trends',
      message: error.message,
    });
  }
});

/**
 * GET /api/trends/:idOrSlug
 * Get a single trend profile by ID or slug
 * Returns full profile including data blob
 */
router.get('/:idOrSlug', async (req, res) => {
  try {
    const { idOrSlug } = req.params;

    // Try to find by ID first, then by slug
    const trend = await prisma.trendProfile.findFirst({
      where: {
        OR: [
          { id: idOrSlug },
          { slug: idOrSlug },
        ],
      },
    });

    if (!trend) {
      return res.status(404).json({
        ok: false,
        error: 'trend_not_found',
        message: `Trend profile not found: ${idOrSlug}`,
      });
    }

    res.json({
      ok: true,
      trend,
    });
  } catch (error) {
    console.error('[Trends] Get error:', error);
    res.status(500).json({
      ok: false,
      error: 'failed_to_get_trend',
      message: error.message,
    });
  }
});

export default router;

