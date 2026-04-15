/**
 * AI Events Intake Router
 * Accepts events, persists to EventLog, and generates AI suggestions
 * Phase 2: With idempotency support
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';
import cuid from 'cuid';
import { handleAISuggestion } from '../orchestrator.js';
import { idempotencyMiddleware, cacheIdempotencyResponse } from '../middleware/idempotency.js';

const prisma = new PrismaClient();
const router = express.Router();

// Apply idempotency middleware to POST /events
router.use(idempotencyMiddleware);

/**
 * POST /events (when mounted at /api, becomes /api/events)
 * Accept an event, persist, and generate AI suggestion
 */
router.post('/events', async (req, res) => {
  try {
    const { id = cuid(), kind, payload = {}, occurredAt, meta } = req.body || {};

    if (!kind) {
      return res.status(400).json({ error: 'kind_required', message: 'Event kind is required' });
    }

    // Persist to EventLog
    await prisma.eventLog.create({
      data: {
        id,
        kind,
        zone: 'A_INTAKE',
        payload: JSON.stringify(payload),
        occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
        meta: meta ? JSON.stringify(meta) : null,
      },
    });

    console.log(`[INTAKE] Event ${id} (${kind}) persisted`);

    // 🔥 Generate AI suggestion inline
    const eventStartTime = Date.now();
    const event = { 
      id, 
      kind, 
      payload, 
      occurredAt: occurredAt || new Date().toISOString(),
      _internalStartTime: eventStartTime, // For latency tracking
    };
    
    // Process asynchronously (don't block response)
    handleAISuggestion(event).catch(err => {
      console.error('[AI] Suggestion generation failed:', err);
    });

    const responseBody = { ok: true, id, message: 'Event accepted for processing' };

    // Cache idempotent response if key provided
    if (req.idempotencyKey) {
      cacheIdempotencyResponse(req.idempotencyKey, req.idempotencyHash, 202, responseBody);
    }

    res.status(202).json(responseBody);
  } catch (err) {
    console.error('[INTAKE] error:', err);
    res.status(500).json({ error: 'intake_failed', message: err.message });
  }
});

export default router;

