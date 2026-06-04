/**
 * PIL — Proactive Intelligence Layer event ingestion (observe only).
 * POST /api/pil/events
 * POST /api/pil/events/batch
 * GET  /api/pil/events/health (public ping)
 */
import express from 'express';
import { z } from 'zod';
import { optionalAuth } from '../middleware/auth.js';
import { guestSessionId } from '../middleware/guestSession.js';
import {
  recordPilEvent,
  recordPilEventBatch,
  getPilEventVolumeSummary,
} from '../services/pilEventsService.js';

const router = express.Router();

const eventSchema = z.object({
  type: z.string().min(1).max(120),
  timestamp: z.string().optional(),
  sessionId: z.string().optional(),
  userId: z.string().optional(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

function resolveUserId(req, bodyUserId) {
  if (req.user?.id) return String(req.user.id);
  if (bodyUserId) return String(bodyUserId);
  if (req.guestSessionId) return `guest_${req.guestSessionId}`;
  return null;
}

router.get('/events/health', (_req, res) => {
  res.json({ ok: true, service: 'pil-events' });
});

router.post('/events', guestSessionId, optionalAuth, async (req, res, next) => {
  try {
    const input = eventSchema.parse(req.body);
    const row = await recordPilEvent({
      ...input,
      userId: resolveUserId(req, input.userId),
      sessionId: input.sessionId ?? (req.guestSessionId ? `guest_${req.guestSessionId}` : undefined),
    });
    res.status(201).json({ ok: true, id: row.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ ok: false, error: 'Validation error', details: error.errors });
    }
    next(error);
  }
});

router.post('/events/batch', guestSessionId, optionalAuth, async (req, res, next) => {
  try {
    const schema = z.object({ events: z.array(eventSchema).min(1).max(50) });
    const { events } = schema.parse(req.body);
    const sessionFallback = req.guestSessionId ? `guest_${req.guestSessionId}` : undefined;
    const normalized = events.map((e) => ({
      ...e,
      userId: resolveUserId(req, e.userId),
      sessionId: e.sessionId ?? sessionFallback,
    }));
    const result = await recordPilEventBatch(normalized);
    res.status(201).json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ ok: false, error: 'Validation error', details: error.errors });
    }
    next(error);
  }
});

router.get('/events/volume', optionalAuth, async (req, res, next) => {
  try {
    const storeId = req.query.storeId ? String(req.query.storeId) : undefined;
    const summary = await getPilEventVolumeSummary(storeId);
    res.json({ ok: true, ...summary });
  } catch (error) {
    next(error);
  }
});

export default router;
