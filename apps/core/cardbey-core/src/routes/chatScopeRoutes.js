/**
 * POST /api/chat/resolve-scope — resolve chat scope for floating/full chat. Additive only.
 * Reuses ConversationThread, canAccessThread, canAccessMission, canAccessStore. No new tables.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getPrismaClient } from '../lib/prisma.js';
import { resolveChatScope, ensureMissionForThread } from '../lib/chatScope.js';

const router = Router();

/**
 * POST /api/chat/resolve-scope
 * Body: { threadId?: string, missionId?: string, storeId?: string }
 * Returns: { ok: true, threadId, missionId, scope, scopeLabel }
 * Priority: threadId > missionId > storeId > user default.
 */
router.post('/resolve-scope', requireAuth, async (req, res, next) => {
  try {
    const user = req.user;
    if (!user?.id) {
      return res.status(401).json({
        ok: false,
        error: 'unauthorized',
        message: 'Not authenticated',
      });
    }
    const prisma = getPrismaClient();
    const body = req.body ?? {};
    const params = {
      threadId: typeof body.threadId === 'string' ? body.threadId : undefined,
      missionId: typeof body.missionId === 'string' ? body.missionId : undefined,
      storeId: typeof body.storeId === 'string' ? body.storeId : undefined,
    };

    const result = await resolveChatScope(prisma, user, params);
    return res.json({
      ok: true,
      threadId: result.threadId,
      missionId: result.missionId,
      scope: result.scope,
      scopeLabel: result.scopeLabel,
    });
  } catch (err) {
    if (err.code === 'SCHEMA_OUT_OF_DATE') {
      return res.status(500).json({
        ok: false,
        error: 'schema_out_of_date',
        message: err.message || 'DB schema out of date: missing ConversationThread.kind. Run migrations.',
      });
    }
    if (err.code === 'FORBIDDEN') {
      return res.status(403).json({
        ok: false,
        error: 'forbidden',
        message: err.message || 'Access denied',
      });
    }
    if (err.code === 'NOT_FOUND') {
      return res.status(404).json({
        ok: false,
        error: 'not_found',
        message: err.message || 'Not found',
      });
    }
    if (err.code === 'UNAUTHORIZED') {
      return res.status(401).json({
        ok: false,
        error: 'unauthorized',
        message: err.message || 'Not authenticated',
      });
    }
    next(err);
  }
});

/**
 * POST /api/chat/ensure-mission
 * Body: { threadId: string }
 * If thread has no missionId, create OrchestratorTask and bind to thread. Returns { ok: true, missionId }.
 */
router.post('/ensure-mission', requireAuth, async (req, res, next) => {
  try {
    const user = req.user;
    if (!user?.id) {
      return res.status(401).json({ ok: false, error: 'unauthorized', message: 'Not authenticated' });
    }
    const threadId = typeof req.body?.threadId === 'string' ? req.body.threadId.trim() : null;
    if (!threadId) {
      return res.status(400).json({ ok: false, error: 'threadId required', message: 'threadId is required' });
    }
    const prisma = getPrismaClient();
    const result = await ensureMissionForThread(prisma, user, threadId);
    return res.json({ ok: true, missionId: result.missionId });
  } catch (err) {
    if (err.code === 'FORBIDDEN') {
      return res.status(403).json({ ok: false, error: 'forbidden', message: err.message || 'Access denied' });
    }
    if (err.code === 'NOT_FOUND') {
      return res.status(404).json({ ok: false, error: 'not_found', message: err.message || 'Not found' });
    }
    if (err.code === 'BAD_REQUEST') {
      return res.status(400).json({ ok: false, error: 'bad_request', message: err.message || 'Bad request' });
    }
    next(err);
  }
});

export default router;
