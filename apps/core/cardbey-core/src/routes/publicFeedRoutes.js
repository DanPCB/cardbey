/**
 * Public feed routes — sidebar data for global frontpage (no auth required).
 */

import { Router } from 'express';
import { optionalAuth } from '../middleware/auth.js';
import { getPrismaClient } from '../lib/prisma.js';
import { buildPublicFeedSidebar } from '../services/feed/publicFeedSidebarService.js';

const router = Router();

/**
 * GET /api/public-feed/sidebar
 * Query: lat, lng, city, category, limitPerSection (default 5)
 * Optional auth sets canManage per item for the signed-in viewer.
 */
router.get('/sidebar', optionalAuth, async (req, res, next) => {
  try {
    const prisma = getPrismaClient();
    const limitPerSection = Math.min(
      Math.max(1, parseInt(String(req.query.limitPerSection ?? '5'), 10) || 5),
      10,
    );

    const viewerId = req.user?.id ? String(req.user.id) : null;
    const profileCity =
      req.user && typeof req.user.city === 'string' && req.user.city.trim()
        ? req.user.city.trim()
        : null;

    const payload = await buildPublicFeedSidebar(prisma, {
      lat: req.query.lat,
      lng: req.query.lng,
      city: req.query.city,
      profileCity,
      category: req.query.category,
      limitPerSection,
      viewerId,
    });

    res.json(payload);
  } catch (error) {
    next(error);
  }
});

export default router;
