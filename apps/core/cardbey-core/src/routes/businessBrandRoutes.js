/**
 * GET /api/business/:storeId/brand — optionalAuth
 * PATCH /api/business/:storeId/brand — requireAuth, owner only
 */

import express from 'express';
import { getPrismaClient } from '../lib/prisma.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';

const router = express.Router();

router.get('/:storeId/brand', optionalAuth, async (req, res) => {
  const { storeId } = req.params;
  const prisma = getPrismaClient();

  try {
    const b = await prisma.business.findUnique({
      where: { id: storeId },
      select: {
        id: true,
        name: true,
        tagline: true,
        primaryColor: true,
        secondaryColor: true,
        logo: true,
        avatarImageUrl: true,
      },
    });

    if (!b) return res.status(404).json({ error: 'Store not found' });

    let logoUrl =
      typeof b.avatarImageUrl === 'string' && b.avatarImageUrl.trim()
        ? b.avatarImageUrl.trim()
        : null;

    if (!logoUrl && typeof b.logo === 'string' && b.logo.trim()) {
      try {
        const parsed = JSON.parse(b.logo);
        const u = parsed?.url ?? parsed?.href;
        if (typeof u === 'string' && u.trim()) logoUrl = u.trim();
      } catch {
        /* ignore */
      }
    }

    return res.json({
      brandKit: {
        storeId: b.id,
        name: b.name,
        tagline: b.tagline ?? null,
        primaryColor: b.primaryColor ?? null,
        secondaryColor: b.secondaryColor ?? null,
        logoUrl,
        qrCodeUrl: null,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[businessBrandRoutes] GET error:', err);
    return res.status(500).json({ error: 'Failed to load brand kit' });
  }
});

router.patch('/:storeId/brand', requireAuth, async (req, res) => {
  const { storeId } = req.params;
  const userId = req.user?.id ?? req.userId;
  const prisma = getPrismaClient();

  try {
    const b = await prisma.business.findUnique({
      where: { id: storeId },
      select: { id: true, userId: true },
    });

    if (!b) return res.status(404).json({ error: 'Store not found' });
    if (b.userId !== userId) return res.status(403).json({ error: 'Forbidden' });

    const { primaryColor, secondaryColor, logoUrl } = req.body ?? {};
    /** @type {Record<string, string | null>} */
    const data = {};

    if (primaryColor !== undefined) {
      if (primaryColor !== null && !/^#[0-9a-fA-F]{6}$/.test(primaryColor)) {
        return res.status(400).json({
          error: 'Invalid primaryColor — must be a 6-digit hex e.g. #1a2b3c',
        });
      }
      data.primaryColor = primaryColor;
    }

    if (secondaryColor !== undefined) {
      if (secondaryColor !== null && !/^#[0-9a-fA-F]{6}$/.test(secondaryColor)) {
        return res.status(400).json({ error: 'Invalid secondaryColor' });
      }
      data.secondaryColor = secondaryColor;
    }

    if (logoUrl !== undefined) {
      if (logoUrl !== null) {
        const isDataUrl = typeof logoUrl === 'string' && logoUrl.startsWith('data:image/');
        const isHttpsUrl = typeof logoUrl === 'string' && logoUrl.startsWith('https://');
        if (!isDataUrl && !isHttpsUrl) {
          return res.status(400).json({ error: 'logoUrl must be a data: or https: URL' });
        }
      }
      data.avatarImageUrl = logoUrl;
    }

    if (!Object.keys(data).length) {
      return res.status(400).json({ error: 'No valid brand fields provided' });
    }

    const updated = await prisma.business.update({
      where: { id: storeId },
      data,
      select: {
        id: true,
        name: true,
        tagline: true,
        primaryColor: true,
        secondaryColor: true,
        avatarImageUrl: true,
      },
    });

    return res.json({
      success: true,
      brandKit: {
        storeId: updated.id,
        name: updated.name,
        tagline: updated.tagline ?? null,
        primaryColor: updated.primaryColor ?? null,
        secondaryColor: updated.secondaryColor ?? null,
        logoUrl: updated.avatarImageUrl ?? null,
        qrCodeUrl: null,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[businessBrandRoutes] PATCH error:', err);
    return res.status(500).json({ error: 'Failed to update brand kit' });
  }
});

export default router;
