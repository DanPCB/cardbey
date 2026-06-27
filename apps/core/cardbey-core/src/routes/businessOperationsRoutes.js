/**
 * Business Operations Platform — governed store operation APIs (Phase 1).
 * All commercial writes dispatch through Runtime Authority (toolDispatcher).
 * No direct repository mutation from routes.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { dispatchTool } from '../lib/toolDispatcher.js';
import { listBusinessActions } from '../lib/business/actionRegistry.js';
import { listBusinessEvents } from '../lib/business/businessEventService.js';
import { getPrismaClient } from '../lib/prisma.js';

const router = Router();

function buildRuntimeContext(req, body = {}) {
  return {
    userId: req.user?.id ?? req.user?.userId ?? null,
    storeId: body.storeId ?? req.query?.storeId ?? null,
    missionId: body.missionId ?? req.headers['x-mission-id'] ?? null,
    runtimeExecutionId:
      body.runtimeExecutionId ??
      req.headers['x-runtime-execution-id'] ??
      req.headers['x-cardbey-trace-id'] ??
      null,
    source: 'business_operations_api',
    route: req.originalUrl,
    role: req.user?.role ?? null,
  };
}

/**
 * GET /api/business-operations/actions
 * Runtime action registry (metadata only).
 */
router.get('/actions', requireAuth, (_req, res) => {
  res.json({ ok: true, actions: listBusinessActions() });
});

/**
 * POST /api/business-operations/execute
 * Body: { toolName, input: { storeId, ... } }
 */
router.post('/execute', requireAuth, async (req, res, next) => {
  try {
    const toolName = String(req.body?.toolName ?? '').trim();
    const input = req.body?.input && typeof req.body.input === 'object' ? req.body.input : {};
    if (!toolName) {
      return res.status(400).json({ ok: false, error: 'toolName is required' });
    }

    const context = buildRuntimeContext(req, input);
    const result = await dispatchTool(toolName, input, context);

    const statusCode =
      result.status === 'ok' ? 200 : result.status === 'blocked' ? 409 : 422;

    return res.status(statusCode).json({
      ok: result.status === 'ok',
      status: result.status,
      toolName,
      output: result.output ?? null,
      blocker: result.blocker ?? null,
      error: result.error ?? null,
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/business-operations/events?storeId=
 */
router.get('/events', requireAuth, async (req, res, next) => {
  try {
    const storeId = String(req.query?.storeId ?? '').trim();
    if (!storeId) {
      return res.status(400).json({ ok: false, error: 'storeId is required' });
    }
    const prisma = getPrismaClient();
    const events = await listBusinessEvents(prisma, storeId, {
      eventType: req.query?.eventType ? String(req.query.eventType) : undefined,
      limit: Number(req.query?.limit ?? 50),
    });
    return res.json({ ok: true, storeId, events });
  } catch (err) {
    return next(err);
  }
});

export default router;
