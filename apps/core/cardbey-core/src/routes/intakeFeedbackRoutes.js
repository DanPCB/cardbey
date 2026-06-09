/**
 * Skill dispatch classification feedback (PIL learning Phase 2).
 * POST /api/intake/feedback
 * GET  /api/intake/feedback/stats/:dispatchLogId
 */
import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { getPrismaClient } from '../lib/prisma.js';

const router = express.Router();

const feedbackBodySchema = z.object({
  dispatchLogId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  correctionText: z.string().max(2000).optional().nullable(),
});

router.post('/feedback', requireAuth, async (req, res, next) => {
  try {
    const parsed = feedbackBodySchema.parse(req.body);
    const userId = req.user?.id ? String(req.user.id) : null;
    const prisma = getPrismaClient();

    const dispatchLog = await prisma.skillDispatchLog.findUnique({
      where: { id: parsed.dispatchLogId },
    });
    if (!dispatchLog) {
      return res.status(404).json({ ok: false, error: 'Dispatch log not found' });
    }

    const correctionText =
      typeof parsed.correctionText === 'string' && parsed.correctionText.trim()
        ? parsed.correctionText.trim()
        : null;

    const feedback = await prisma.skillDispatchFeedback.create({
      data: {
        dispatchLogId: parsed.dispatchLogId,
        userId,
        rating: parsed.rating,
        correctionText,
      },
    });

    if (correctionText) {
      console.log(
        `[Feedback] Correction received for intent="${dispatchLog.intent}" skill="${dispatchLog.matchedSkill ?? ''}": "${correctionText.slice(0, 120)}"`,
      );
    }

    return res.status(201).json({ ok: true, feedback });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ ok: false, error: 'Validation error', details: error.errors });
    }
    return next(error);
  }
});

router.get('/feedback/stats/:dispatchLogId', requireAuth, async (req, res, next) => {
  try {
    const dispatchLogId = String(req.params.dispatchLogId ?? '').trim();
    if (!dispatchLogId) {
      return res.status(400).json({ ok: false, error: 'dispatchLogId required' });
    }

    const prisma = getPrismaClient();
    const stats = await prisma.skillDispatchFeedback.groupBy({
      by: ['rating'],
      where: { dispatchLogId },
      _count: true,
    });

    return res.json({ ok: true, stats });
  } catch (error) {
    return next(error);
  }
});

export default router;
