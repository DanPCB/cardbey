import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { canAccessMission } from './agentMessagesRoutes.js';
import { getPrismaClient } from '../lib/prisma.js';
import { getOrCreateMission } from '../lib/mission.js';
import { getTenantId } from '../lib/missionAccess.js';
import { getEvents, getBlackboardEventByIdOrSeq } from '../lib/missionBlackboard.js';

const router = express.Router();

const ALLOWED_SPAWN_CHILD_SKILLS = new Set(['mission-coordinator', 'cardbey-campaigns']);

/**
 * POST /api/agents/v1/:missionId/spawn
 * Also used by POST /api/missions/:missionId/spawn-child and .../openclaw/spawn-child (missionsRoutes).
 * Returns 202 + childRunId immediately.
 * @type {import('express').RequestHandler}
 */
export async function handleAgentsV1MissionSpawn(req, res, next) {
  try {
    const missionIdTrimmed = typeof req.params.missionId === 'string' ? req.params.missionId.trim() : '';
    const intent = typeof req.body?.intent === 'string' ? req.body.intent.trim() : '';
    if (!missionIdTrimmed || !intent) {
      return res.status(400).json({
        ok: false,
        error: 'validation',
        message: 'missionId and body.intent are required',
      });
    }

    const allowed = await canAccessMission(missionIdTrimmed, req.user);
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        error: 'forbidden',
        code: 'FORBIDDEN_MISSION',
        message: 'You do not have access to this mission.',
      });
    }

    const prisma = getPrismaClient();

    // Lazy-create Mission row so AgentRun FK succeeds.
    const mission = await getOrCreateMission(missionIdTrimmed, req.user, { prisma });

    const userId = req.user?.id != null ? String(req.user.id).trim() : '';
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'unauthorized', message: 'User id is required to spawn a child run.' });
    }

    const tenantId =
      (mission.tenantId != null && String(mission.tenantId).trim() ? String(mission.tenantId).trim() : '') ||
      (getTenantId(req.user) != null ? String(getTenantId(req.user)).trim() : '') ||
      '';
    if (!tenantId) {
      return res.status(400).json({
        ok: false,
        error: 'validation',
        message: 'tenantId could not be resolved for this mission.',
      });
    }

    let parentAgentRunId = null;
    if (typeof req.body?.parentAgentRunId === 'string' && req.body.parentAgentRunId.trim()) {
      const pid = req.body.parentAgentRunId.trim();
      const parent = await prisma.agentRun.findFirst({
        where: { id: pid, missionId: missionIdTrimmed },
        select: { id: true },
      });
      if (parent) parentAgentRunId = pid;
    }

    const correlationId =
      typeof req.body?.correlationId === 'string' && req.body.correlationId.trim()
        ? req.body.correlationId.trim()
        : null;

    let timeoutMs;
    if (req.body?.timeoutMs == null || req.body.timeoutMs === '') {
      timeoutMs = undefined;
    } else {
      const n = typeof req.body.timeoutMs === 'number' ? req.body.timeoutMs : parseInt(String(req.body.timeoutMs).trim(), 10);
      timeoutMs = Number.isFinite(n) && n > 0 ? Math.min(n, 600_000) : undefined;
    }

    let skillsInput = req.body?.skills;
    if (typeof skillsInput === 'string') {
      skillsInput = skillsInput
        .split(',')
        .map((s) => s.trim().replace(/\s+/g, '-').toLowerCase())
        .filter(Boolean);
    }

    let skills;
    if (Array.isArray(skillsInput)) {
      const filtered = skillsInput
        .map((s) => (typeof s === 'string' ? s.trim().replace(/\s+/g, '-').toLowerCase() : ''))
        .filter((s) => s && ALLOWED_SPAWN_CHILD_SKILLS.has(s));
      skills = filtered.length ? filtered : undefined;
    }

    const model =
      typeof req.body?.model === 'string' && req.body.model.trim()
        ? req.body.model.trim().slice(0, 128)
        : undefined;

    const { spawnChildAgent } = await import('../../../openclaw/childAgent.js');
    const { childRunId, statusPromise } = await spawnChildAgent(missionIdTrimmed, intent, {
      tenantId,
      userId,
      parentAgentRunId,
      correlationId,
      timeoutMs,
      ...(skills ? { skills } : {}),
      ...(model ? { model } : {}),
    });

    // Avoid unhandled promise rejection for background failures.
    statusPromise.catch((err) => {
      const allowLog = process.env.DEBUG_MISSION_RUNNER === 'true' || process.env.NODE_ENV !== 'production';
      if (allowLog) console.warn('[agents/v1/spawn] background run ended with error:', err?.message || err);
    });

    if (process.env.DEBUG_MISSION_RUNNER === 'true' || process.env.NODE_ENV !== 'production') {
      console.log('[agents/v1/spawn] accepted', { missionId: missionIdTrimmed, childRunId });
    }

    return res.status(202).json({ ok: true, childRunId });
  } catch (err) {
    const msg = err?.message || String(err);
    if (err?.code === 'P2003' || (typeof msg === 'string' && msg.includes('Foreign key constraint'))) {
      return res.status(400).json({ ok: false, error: 'invalid_foreign_key', message: msg });
    }
    if (String(msg).includes('OpenClaw runtime is disabled')) {
      return res.status(503).json({ ok: false, error: 'openclaw_disabled', message: msg });
    }
    next(err);
  }
}

router.post('/:missionId/spawn', requireAuth, handleAgentsV1MissionSpawn);

/**
 * GET /api/agents/v1/missions/:missionId/blackboard
 * Read-only wrapper around MissionBlackboard.getEvents().
 *
 * Query:
 * - correlationId (optional)
 * - limit (optional, default 50, max 5000)
 * - offset (optional) alias for afterSeq
 * - afterSeq (optional) numeric
 */
router.get('/:missionId/blackboard', requireAuth, async (req, res, next) => {
  try {
    const missionIdTrimmed = typeof req.params.missionId === 'string' ? req.params.missionId.trim() : '';
    if (!missionIdTrimmed) return res.status(400).json({ ok: false, error: 'mission_id_required', message: 'missionId is required' });

    const allowed = await canAccessMission(missionIdTrimmed, req.user);
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        error: 'forbidden',
        code: 'FORBIDDEN_MISSION',
        message: 'You do not have access to this mission.',
      });
    }

    const rawLimit = req.query?.limit;
    const limit =
      typeof rawLimit === 'string' && /^\d+$/.test(rawLimit.trim())
        ? Math.min(5000, Math.max(1, parseInt(rawLimit.trim(), 10)))
        : 50;

    const rawOffset = req.query?.offset;
    const rawAfterSeq = req.query?.afterSeq;
    const cursorRaw = typeof rawAfterSeq === 'string' ? rawAfterSeq : rawOffset;
    const afterSeq =
      typeof cursorRaw === 'string' && /^\d+$/.test(cursorRaw.trim())
        ? Math.max(0, parseInt(cursorRaw.trim(), 10))
        : undefined;

    const rawCid = req.query?.correlationId;
    const correlationId =
      typeof rawCid === 'string' && rawCid.trim()
        ? rawCid.trim()
        : undefined;

    const { events, error } = await getEvents(missionIdTrimmed, {
      limit,
      ...(afterSeq != null ? { afterSeq } : {}),
      ...(correlationId ? { correlationId } : {}),
    });

    if (error) return res.status(500).json({ ok: false, error: 'blackboard_read_failed', message: error });

    return res.json({ ok: true, events });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/agents/v1/missions/:missionId/blackboard/stream
 * Polling-based SSE incremental stream.
 *
 * Auth:
 * - Use Authorization: Bearer <token> OR `?token=<token>` query param (requireAuth supports both).
 */
router.get('/:missionId/blackboard/stream', requireAuth, async (req, res, next) => {
  try {
    const missionIdTrimmed = typeof req.params.missionId === 'string' ? req.params.missionId.trim() : '';
    if (!missionIdTrimmed) return res.status(400).json({ ok: false, error: 'mission_id_required', message: 'missionId is required' });

    const allowed = await canAccessMission(missionIdTrimmed, req.user);
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        error: 'forbidden',
        code: 'FORBIDDEN_MISSION',
        message: 'You do not have access to this mission.',
      });
    }

    const rawCid = req.query?.correlationId;
    const correlationId =
      typeof rawCid === 'string' && rawCid.trim()
        ? rawCid.trim()
        : undefined;

    const rawLimit = req.query?.limit;
    const limit =
      typeof rawLimit === 'string' && /^\d+$/.test(rawLimit.trim())
        ? Math.min(5000, Math.max(1, parseInt(rawLimit.trim(), 10)))
        : 50;

    const rawPollMs = req.query?.pollMs;
    const pollMs =
      typeof rawPollMs === 'string' && /^\d+$/.test(rawPollMs.trim())
        ? Math.min(10_000, Math.max(500, parseInt(rawPollMs.trim(), 10)))
        : 3000;

    const rawCursor = req.headers['last-event-id'] || req.query?.afterSeq || req.query?.offset;
    const cursorStr = typeof rawCursor === 'string' ? rawCursor.trim() : '';
    const initialAfterSeq = /^\d+$/.test(cursorStr) ? Math.max(0, parseInt(cursorStr, 10)) : undefined;

    // SSE headers (set before writes).
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // SSE is read-only; keep it permissive for external clients.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Last-Event-ID');

    res.flushHeaders?.();
    res.write(':connected\n\n');
    res.write(`event: ready\ndata: ${JSON.stringify({ ok: true, missionId: missionIdTrimmed, correlationId: correlationId ?? null, lastSeq: initialAfterSeq ?? null, pollMs })}\n\n`);

    let closed = false;
    const close = () => {
      closed = true;
    };
    req.on('close', close);
    req.on('aborted', close);

    // Heartbeat keeps proxies/browsers from closing idle SSE connections.
    const heartbeat = setInterval(() => {
      if (closed) return;
      try {
        res.write(':\n\n');
      } catch {
        close();
      }
    }, 15000);

    let lastSeqSent = initialAfterSeq;
    let cursorInitialized = typeof initialAfterSeq === 'number';
    let polling = false;

    const sendEventRow = (evt) => {
      // Each SSE frame carries one blackboard event row.
      res.write(`event: blackboard-event\ndata: ${JSON.stringify(evt)}\n\n`);
    };

    // Initial fetch:
    // - If initialAfterSeq provided: fetch new rows (seq > cursor)
    // - Else: fetch latest window (limit) and start cursor from its tail.
    if (!cursorInitialized) {
      const { events: initialEvents, error } = await getEvents(missionIdTrimmed, {
        limit: Math.min(limit, 5000),
        ...(correlationId ? { correlationId } : {}),
      });
      if (error) {
        res.write(`event: error\ndata: ${JSON.stringify({ ok: false, error, message: 'blackboard_initial_fetch_failed' })}\n\n`);
      } else {
        for (const e of initialEvents) sendEventRow(e);
        lastSeqSent = initialEvents.length ? initialEvents[initialEvents.length - 1]?.seq : 0;
      }
    }

    const pollOnce = async () => {
      if (closed || polling) return;
      polling = true;
      try {
        const after = typeof lastSeqSent === 'number' ? lastSeqSent : undefined;
        const { events, error } = await getEvents(missionIdTrimmed, {
          limit,
          ...(after != null ? { afterSeq: after } : {}),
          ...(correlationId ? { correlationId } : {}),
        });
        if (error) {
          res.write(`event: error\ndata: ${JSON.stringify({ ok: false, error, message: 'blackboard_poll_failed' })}\n\n`);
          return;
        }
        for (const e of events) {
          sendEventRow(e);
          lastSeqSent = e.seq;
        }
      } finally {
        polling = false;
      }
    };

    const interval = setInterval(() => {
      pollOnce().catch(() => {});
    }, pollMs);

    // Block the handler until client disconnects.
    // (Express will keep the connection open because we never call res.end().)
    req.on('close', () => {
      clearInterval(interval);
      clearInterval(heartbeat);
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/agents/v1/missions/:missionId/events/:eventId
 * Fetch a single MissionBlackboard event by `id` (string) or `seq` (numeric).
 */
router.get('/:missionId/events/:eventId', requireAuth, async (req, res, next) => {
  try {
    const missionIdTrimmed = typeof req.params.missionId === 'string' ? req.params.missionId.trim() : '';
    const eventIdRaw = typeof req.params.eventId === 'string' ? req.params.eventId.trim() : '';
    if (!missionIdTrimmed || !eventIdRaw) {
      return res.status(400).json({ ok: false, error: 'validation', message: 'missionId and eventId are required' });
    }

    const allowed = await canAccessMission(missionIdTrimmed, req.user);
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        error: 'forbidden',
        code: 'FORBIDDEN_MISSION',
        message: 'You do not have access to this mission.',
      });
    }

    const { event, error } = await getBlackboardEventByIdOrSeq(missionIdTrimmed, eventIdRaw);
    if (error) return res.status(500).json({ ok: false, error: 'blackboard_event_read_failed', message: error });
    if (!event) return res.status(404).json({ ok: false, error: 'not_found', message: 'Event not found' });

    return res.json({ ok: true, event });
  } catch (err) {
    next(err);
  }
});

export default router;

