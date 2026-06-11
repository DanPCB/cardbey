/**
 * Conversation Routes — REST endpoints for continuous Performer sessions.
 */
import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import conversationService from '../services/conversation/conversationService.js';

const router = express.Router();

router.post('/sessions', requireAuth, async (req, res, next) => {
  try {
    const { storeId, surface, sessionId } = req.body ?? {};
    const { session, skipped, created } = await conversationService.getOrCreateSession({
      userId: req.userId,
      storeId: typeof storeId === 'string' ? storeId : undefined,
      surface: typeof surface === 'string' ? surface : 'performer_console',
      sessionId: typeof sessionId === 'string' ? sessionId : undefined,
    });

    if (skipped || !session) {
      return res.json({ ok: true, session: null, skipped: true });
    }

    res.json({
      ok: true,
      session: {
        id: session.id,
        messageCount: session.messageCount,
        storeId: session.storeId,
        surface: session.surface,
        activeMissionId: session.activeMissionId,
        created: Boolean(created),
      },
    });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ ok: false, error: error.message });
    next(error);
  }
});

router.get('/sessions/:sessionId/messages', requireAuth, async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    await conversationService.assertSessionOwner(sessionId, req.userId);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
    const messages = await conversationService.getRecentMessages(sessionId, limit);
    res.json({ ok: true, messages });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ ok: false, error: error.message });
    next(error);
  }
});

router.get('/sessions/:sessionId/context', requireAuth, async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    await conversationService.assertSessionOwner(sessionId, req.userId);
    const context = await conversationService.buildConversationContext(sessionId);
    res.json({ ok: true, context });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ ok: false, error: error.message });
    next(error);
  }
});

router.post('/sessions/:sessionId/pending-actions', requireAuth, async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    await conversationService.assertSessionOwner(sessionId, req.userId);
    const { kind, proposedAction, missionId, stepId, payload } = req.body ?? {};
    const { action, skipped } = await conversationService.addPendingAction({
      sessionId,
      kind,
      proposedAction,
      missionId,
      stepId,
      payload,
    });
    res.json({ ok: true, action, skipped: Boolean(skipped) });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ ok: false, error: error.message });
    next(error);
  }
});

router.patch('/pending-actions/:actionId/resolve', requireAuth, async (req, res, next) => {
  try {
    const { actionId } = req.params;
    const { resolution } = req.body ?? {};
    const { action, skipped } = await conversationService.resolvePendingAction(actionId, resolution);
    res.json({ ok: true, action, skipped: Boolean(skipped) });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ ok: false, error: error.message });
    next(error);
  }
});

export default router;
