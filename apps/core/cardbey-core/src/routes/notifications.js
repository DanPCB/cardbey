/**
 * Notification routes - guest-aware.
 * GET /api/notifications?limit=20
 * POST /api/notifications/:id/read
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { optionalAuth } from '../middleware/auth.js';
import { guestSessionId } from '../middleware/guestSession.js';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /api/notifications?limit=20
 * Returns notifications for req.userId (authed) or guest_<req.guestSessionId>.
 */
router.get('/', optionalAuth, guestSessionId, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    let userId = null;
    if (req.userId) {
      userId = req.userId;
    } else if (req.guestSessionId) {
      userId = `guest_${req.guestSessionId}`;
    }
    if (!userId) {
      return res.status(200).json({ ok: true, notifications: [] });
    }

    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return res.status(200).json({
      ok: true,
      notifications: notifications.map((n) => ({
        id: n.id,
        draftId: n.draftId,
        type: n.type,
        title: n.title,
        message: n.message,
        meta: n.meta,
        readAt: n.readAt,
        createdAt: n.createdAt,
      })),
    });
  } catch (error) {
    // Phase 0: never 500 — table may be missing or Prisma may throw
    const code = error?.code ?? error?.name ?? 'unknown';
    console.warn('[Notifications] GET error (returning empty):', { code, message: error?.message });
    return res.status(200).json({ ok: true, notifications: [] });
  }
});

/**
 * POST /api/notifications/:id/read
 * Mark notification as read. User must own it (userId or guest_<sessionId>).
 */
router.post('/:id/read', optionalAuth, guestSessionId, async (req, res) => {
  try {
    const { id } = req.params;
    let userId = null;
    if (req.userId) {
      userId = req.userId;
    } else if (req.guestSessionId) {
      userId = `guest_${req.guestSessionId}`;
    }
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'auth_required', message: 'Sign in or provide guest session' });
    }

    const notification = await prisma.notification.findUnique({
      where: { id },
    });
    if (!notification) {
      return res.status(404).json({ ok: false, error: 'not_found', message: 'Notification not found' });
    }
    if (notification.userId !== userId) {
      return res.status(403).json({ ok: false, error: 'forbidden', message: 'Not your notification' });
    }

    await prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    // Phase 0: never 500 — table may be missing or Prisma may throw
    const code = error?.code ?? error?.name ?? 'unknown';
    console.warn('[Notifications] POST read error:', { code, message: error?.message });
    return res.status(200).json({ ok: true });
  }
});

export default router;
