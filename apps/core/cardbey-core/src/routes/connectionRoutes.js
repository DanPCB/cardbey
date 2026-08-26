/**
 * User connection API — /api/connections/*
 * Auth required; rejects guests.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { getPrismaClient } from '../lib/prisma.js';
import {
  createConnectionRequest,
  deleteConnection,
  listConnections,
  respondToConnection,
  serializeConnection,
} from '../services/connections/userConnectionService.js';

const router = Router();
const prisma = getPrismaClient();

function isGuest(req) {
  return req?.user?.role === 'guest' || String(req?.user?.id || '').startsWith('guest_');
}

async function requireDbUser(req) {
  if (!req?.user?.id) return null;
  return prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true },
  });
}

function guestForbidden(res) {
  return res.status(403).json({
    ok: false,
    code: 'AUTH_REQUIRED',
    error: 'forbidden',
    message: 'Auth required for connections',
  });
}

const limitCreate = rateLimit({
  windowMs: 60_000,
  max: 20,
  keyGenerator: (req) => `connections:create:${req?.user?.id || 'anon'}:${req.ip || 'unknown'}`,
  code: 'connections_rate_limited',
});

const limitRespond = rateLimit({
  windowMs: 60_000,
  max: 60,
  keyGenerator: (req) => `connections:respond:${req?.user?.id || 'anon'}:${req.ip || 'unknown'}`,
  code: 'connections_rate_limited',
});

/**
 * POST /api/connections
 * Body: { toUserId, suggestionId? }
 */
router.post('/connections', requireAuth, limitCreate, async (req, res, next) => {
  try {
    if (isGuest(req)) return guestForbidden(res);
    const dbUser = await requireDbUser(req);
    if (!dbUser) {
      return res.status(401).json({ ok: false, code: 'UNAUTHORIZED', error: 'unauthorized', message: 'User not found' });
    }

    const toUserId = typeof req.body?.toUserId === 'string' ? req.body.toUserId.trim() : '';
    const suggestionId =
      typeof req.body?.suggestionId === 'string' && req.body.suggestionId.trim()
        ? req.body.suggestionId.trim()
        : null;
    const source = suggestionId ? 'contact_suggestion' : 'direct';

    const result = await createConnectionRequest(prisma, {
      fromUserId: dbUser.id,
      toUserId,
      suggestionId,
      source,
    });

    if (!result.ok) {
      return res.status(result.status || 400).json({
        ok: false,
        code: result.code,
        error: 'failed',
        message: result.message,
      });
    }

    return res.status(result.created ? 201 : 200).json({
      ok: true,
      created: Boolean(result.created),
      code: result.code || null,
      connection: serializeConnection(result.connection),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/connections?status=&direction=incoming|outgoing|mutual
 */
router.get('/connections', requireAuth, async (req, res, next) => {
  try {
    if (isGuest(req)) return guestForbidden(res);
    const dbUser = await requireDbUser(req);
    if (!dbUser) {
      return res.status(401).json({ ok: false, code: 'UNAUTHORIZED', error: 'unauthorized', message: 'User not found' });
    }

    const status = typeof req.query.status === 'string' ? req.query.status.trim() : undefined;
    const direction = typeof req.query.direction === 'string' ? req.query.direction.trim() : 'mutual';
    const rows = await listConnections(prisma, {
      userId: dbUser.id,
      status,
      direction,
    });

    return res.json({
      ok: true,
      connections: rows.map(serializeConnection),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/connections/:id/accept
 */
router.post('/connections/:id/accept', requireAuth, limitRespond, async (req, res, next) => {
  try {
    if (isGuest(req)) return guestForbidden(res);
    const dbUser = await requireDbUser(req);
    if (!dbUser) {
      return res.status(401).json({ ok: false, code: 'UNAUTHORIZED', error: 'unauthorized', message: 'User not found' });
    }
    const connectionId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    const result = await respondToConnection(prisma, {
      connectionId,
      actorUserId: dbUser.id,
      action: 'accept',
    });
    if (!result.ok) {
      return res.status(result.status || 400).json({
        ok: false,
        code: result.code,
        error: 'failed',
        message: result.message,
      });
    }
    return res.json({ ok: true, connection: serializeConnection(result.connection) });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/connections/:id/reject
 */
router.post('/connections/:id/reject', requireAuth, limitRespond, async (req, res, next) => {
  try {
    if (isGuest(req)) return guestForbidden(res);
    const dbUser = await requireDbUser(req);
    if (!dbUser) {
      return res.status(401).json({ ok: false, code: 'UNAUTHORIZED', error: 'unauthorized', message: 'User not found' });
    }
    const connectionId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    const result = await respondToConnection(prisma, {
      connectionId,
      actorUserId: dbUser.id,
      action: 'reject',
    });
    if (!result.ok) {
      return res.status(result.status || 400).json({
        ok: false,
        code: result.code,
        error: 'failed',
        message: result.message,
      });
    }
    return res.json({ ok: true, connection: serializeConnection(result.connection) });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/connections/:id
 */
router.delete('/connections/:id', requireAuth, limitRespond, async (req, res, next) => {
  try {
    if (isGuest(req)) return guestForbidden(res);
    const dbUser = await requireDbUser(req);
    if (!dbUser) {
      return res.status(401).json({ ok: false, code: 'UNAUTHORIZED', error: 'unauthorized', message: 'User not found' });
    }
    const connectionId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    const result = await deleteConnection(prisma, {
      connectionId,
      actorUserId: dbUser.id,
    });
    if (!result.ok) {
      return res.status(result.status || 400).json({
        ok: false,
        code: result.code,
        error: 'failed',
        message: result.message,
      });
    }
    return res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
