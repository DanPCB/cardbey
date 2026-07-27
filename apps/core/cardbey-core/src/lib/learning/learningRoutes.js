/**
 * ============================================================
 * LEARNING LAYER — API ROUTES
 * ============================================================
 *
 * HTTP API for the learning layer. Mounted under /api/learning.
 *
 * Supports:
 * - Integration/E2E contract: userId in body/query, { success: true } responses
 * - Dashboard contract: authenticated session + LearningIntegration enrichment
 */

import express from 'express';
import { z } from 'zod';
import { getPrismaClient, prisma } from '../prisma.js';
import { requireAuth, optionalAuth } from '../../middleware/auth.js';
import { FeedbackCapture } from './feedbackCapture.js';
import { LearningIntegration } from './learningIntegration.js';
import { getIntentIntegration } from '../intent/intentIntegration.js';

const router = express.Router();
const feedbackCapture = new FeedbackCapture();

function getDb() {
  return getPrismaClient();
}

function getLearningIntegration() {
  try {
    const integration = getIntentIntegration();
    if (integration?.reasoner?.learning) {
      return integration.reasoner.learning;
    }
  } catch {
    // fall through
  }
  return new LearningIntegration({ contextProvider: null, reasoner: null });
}

const dashboardFeedbackSchema = z.object({
  sessionId: z.string().min(1),
  feedbackType: z.enum(['thumbs_up', 'thumbs_down', 'rating']),
  rating: z.number().int().min(1).max(5).optional(),
  result: z.object({
    intent: z.string().min(1),
    confidence: z.number().optional(),
    action: z.string().optional(),
    userState: z.record(z.unknown()).optional(),
  }),
});

const dashboardCorrectionSchema = z.object({
  sessionId: z.string().min(1),
  originalIntent: z.string().min(1),
  correctedIntent: z.string().min(1),
  context: z.record(z.unknown()).optional(),
});

const profilePatchSchema = z.object({
  learningEnabled: z.boolean().optional(),
  defaultAction: z.string().nullable().optional(),
});

async function captureFeedbackRecord(userId, sessionId, payload) {
  return feedbackCapture.captureExplicit(userId, sessionId || 'unknown', payload);
}

// ============================================================
// FEEDBACK ROUTES
// ============================================================

/**
 * POST /api/learning/feedback
 */
router.post('/feedback', optionalAuth, async (req, res) => {
  try {
    if (req.body?.feedbackType && req.body?.sessionId && req.body?.result) {
      if (!req.user?.id) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }
      const parsed = dashboardFeedbackSchema.parse(req.body);
      const userId = String(req.user.id);
      const record = await getLearningIntegration().processFeedback(
        userId,
        parsed.sessionId,
        { ...parsed.result, confidence: parsed.result.confidence ?? 0 },
        parsed.feedbackType,
      );
      return res.status(201).json({ ok: true, success: true, feedback: record });
    }

    const { userId, sessionId, type, targetType, targetId, value, metadata } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required', success: false });
    }
    if (!type) {
      return res.status(400).json({ error: 'type is required', success: false });
    }

    const feedback = await captureFeedbackRecord(userId, sessionId, {
      type,
      targetType: targetType || 'intent',
      targetId: targetId || 'unknown',
      value,
      metadata: metadata || {},
    });

    console.log(`[Learning] Feedback captured: ${type} from ${userId}`);

    return res.json({
      success: true,
      feedback,
      message: 'Feedback recorded successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
    }
    console.error('[Learning] Feedback error:', error);
    return res.status(500).json({
      error: error.message,
      success: false,
    });
  }
});

/**
 * POST /api/learning/correction
 */
router.post('/correction', optionalAuth, async (req, res) => {
  try {
    if (req.body?.sessionId && req.body?.originalIntent && req.body?.correctedIntent && !req.body?.userId) {
      if (!req.user?.id) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }
      const parsed = dashboardCorrectionSchema.parse(req.body);
      const userId = String(req.user.id);
      const record = await getLearningIntegration().processCorrection(
        userId,
        parsed.sessionId,
        parsed.originalIntent,
        parsed.correctedIntent,
        parsed.context ?? {},
      );
      return res.status(201).json({ ok: true, success: true, feedback: record });
    }

    const { userId, sessionId, originalIntent, correctedIntent, context } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required', success: false });
    }
    if (!originalIntent || !correctedIntent) {
      return res.status(400).json({
        error: 'originalIntent and correctedIntent are required',
        success: false,
      });
    }

    const feedback = await captureFeedbackRecord(userId, sessionId, {
      type: 'correction',
      targetType: 'intent',
      targetId: originalIntent,
      value: 0,
      metadata: {
        original: originalIntent,
        corrected: correctedIntent,
        context: context || {},
      },
    });

    console.log(`[Learning] Correction recorded: ${originalIntent} → ${correctedIntent} from ${userId}`);

    return res.json({
      success: true,
      feedback,
      message: 'Correction recorded successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
    }
    console.error('[Learning] Correction error:', error);
    return res.status(500).json({
      error: error.message,
      success: false,
    });
  }
});

/**
 * POST /api/learning/implicit
 */
router.post('/implicit', async (req, res) => {
  try {
    const { userId, sessionId, action, metadata, result } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required', success: false });
    }
    if (!action) {
      return res.status(400).json({ error: 'action is required', success: false });
    }

    const implicitAction =
      action === 'skip' ? 'skip_step' : action === 'reroll' || action === 'abandon' ? action : action;

    const feedback =
      (await feedbackCapture.captureImplicit(userId, sessionId || 'unknown', implicitAction, result || metadata || {})) ||
      (await captureFeedbackRecord(userId, sessionId, {
        type: action,
        targetType: 'action',
        targetId: 'implicit',
        value: 0,
        metadata: metadata || {},
      }));

    console.log(`[Learning] Implicit feedback: ${action} from ${userId}`);

    return res.json({
      success: true,
      feedback,
      message: 'Implicit feedback recorded',
    });
  } catch (error) {
    console.error('[Learning] Implicit feedback error:', error);
    return res.status(500).json({
      error: error.message,
      success: false,
    });
  }
});

/**
 * POST /api/learning/mission-outcome
 */
router.post('/mission-outcome', async (req, res) => {
  try {
    const { userId, sessionId, mission } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required', success: false });
    }
    if (!mission?.id) {
      return res.status(400).json({ error: 'mission with id is required', success: false });
    }

    const feedback = await feedbackCapture.captureMissionOutcome(userId, sessionId || 'unknown', mission);

    console.log(`[Learning] Mission outcome: ${mission.status} for ${mission.id} from ${userId}`);

    return res.json({
      success: true,
      feedback,
      message: 'Mission outcome recorded',
    });
  } catch (error) {
    console.error('[Learning] Mission outcome error:', error);
    return res.status(500).json({
      error: error.message,
      success: false,
    });
  }
});

/**
 * GET /api/learning/feedback
 */
router.get('/feedback', async (req, res) => {
  try {
    const { userId, type, limit = '50' } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required', success: false });
    }

    const feedback = await getDb().userFeedback.findMany({
      where: {
        userId: String(userId),
        ...(type ? { type: String(type) } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(String(limit), 10) || 50,
    });

    return res.json({
      success: true,
      feedback,
      count: feedback.length,
    });
  } catch (error) {
    console.error('[Learning] Get feedback error:', error);
    return res.status(500).json({
      error: error.message,
      success: false,
    });
  }
});

/**
 * GET /api/learning/profile
 */
router.get('/profile', optionalAuth, async (req, res) => {
  try {
    const userId = req.query.userId ? String(req.query.userId) : req.user?.id ? String(req.user.id) : null;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required', success: false });
    }

    if (req.query.userId) {
      const profile = await getDb().userProfile.findUnique({ where: { userId } });
      const patterns = await getDb().behaviorPattern.findMany({
        where: { userId },
        orderBy: { frequency: 'desc' },
        take: 10,
      });

      return res.json({
        success: true,
        profile,
        patterns,
        hasLearningData: !!profile || patterns.length > 0,
      });
    }

    const enriched = await getLearningIntegration().getLearningProfile(userId);
    return res.json({ ok: true, success: true, profile: enriched });
  } catch (error) {
    console.error('[Learning] Get profile error:', error);
    return res.status(500).json({
      error: error.message,
      success: false,
    });
  }
});

/**
 * PATCH /api/learning/profile — dashboard learning toggle
 */
router.patch('/profile', requireAuth, async (req, res) => {
  try {
    const parsed = profilePatchSchema.parse(req.body);
    const userId = String(req.user.id);
    const profile = await getLearningIntegration().personalization.upsertProfile(userId, parsed);
    return res.json({ ok: true, success: true, profile });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ ok: false, success: false, error: 'Validation error', details: error.errors });
    }
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/learning/patterns — dashboard observability
 */
router.get('/patterns', requireAuth, async (req, res) => {
  try {
    const userId = String(req.user.id);
    const patterns = await getDb().behaviorPattern.findMany({
      where: { userId },
      orderBy: { frequency: 'desc' },
      take: 50,
    });
    return res.json({ ok: true, success: true, patterns });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/learning/profile
 */
router.delete('/profile', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required', success: false });
    }

    await getDb().userFeedback.deleteMany({ where: { userId } });
    await getDb().behaviorPattern.deleteMany({ where: { userId } });
    await getDb().userProfile.delete({ where: { userId } }).catch(() => {});

    console.log(`[Learning] Profile cleared for ${userId}`);

    return res.json({
      success: true,
      message: 'Learning data cleared successfully',
    });
  } catch (error) {
    console.error('[Learning] Clear profile error:', error);
    return res.status(500).json({
      error: error.message,
      success: false,
    });
  }
});

/**
 * GET /api/learning/health
 */
router.get('/health', async (_req, res) => {
  try {
    const feedbackCount = await prisma.userFeedback.count();
    const patternCount = await prisma.behaviorPattern.count();
    const profileCount = await prisma.userProfile.count();

    return res.json({
      success: true,
      status: 'healthy',
      stats: {
        feedbackCount,
        patternCount,
        profileCount,
      },
    });
  } catch (error) {
    console.error('[Learning] Health check error:', error);
    return res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: error.message,
    });
  }
});

export default router;
