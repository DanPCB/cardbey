/**
 * Space Post publish routes — owner authenticated.
 * POST /api/stores/:storeId/space-updates
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getPrismaClient } from '../lib/prisma.js';
import { publishSpaceUpdate } from '../lib/spacePosts/publishSpaceUpdate.js';

const router = Router();

router.post('/:storeId/space-updates', requireAuth, async (req, res, next) => {
  try {
    const storeId = String(req.params.storeId || '').trim();
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const headerKey = req.get('Idempotency-Key') || req.get('idempotency-key');
    const prisma = getPrismaClient();
    const result = await publishSpaceUpdate(prisma, {
      storeId,
      userId: req.userId,
      user: req.user,
      text: body.text ?? body.body ?? '',
      title: body.title ?? null,
      mediaUrl: body.mediaUrl ?? body.imageUrl ?? body.videoUrl ?? null,
      mediaKind: body.mediaKind ?? null,
      productId: body.productId ?? null,
      serviceId: body.serviceId ?? null,
      promotionId: body.promotionId ?? null,
      distribution: body.distribution ?? body.visibility ?? null,
      idempotencyKey: body.idempotencyKey || headerKey || null,
      attachToShows: body.attachToShows !== false,
    });

    if (!result.ok) {
      return res.status(result.status || 400).json({
        ok: false,
        error: result.error,
        message: result.error,
      });
    }

    return res.status(result.status || 201).json({
      ok: true,
      deduped: result.deduped,
      storeId: result.storeId,
      actorIdentity: result.actorIdentity,
      distribution: result.distribution,
      globalRankBumped: result.globalRankBumped,
      publishedAt: result.publishedAt,
      showWorkId: result.showWorkId,
      event: result.event,
      spaceHref: result.spaceHref,
    });
  } catch (err) {
    return next(err);
  }
});

export default router;
