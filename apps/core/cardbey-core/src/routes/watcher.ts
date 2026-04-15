/**
 * System Watcher API Routes
 * Endpoints for recording events, fetching insights, and chatting with the watcher
 */

import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { recordSystemEvent, getRecentEvents, computeAggregates } from '../services/systemEventsService.js';
import { getRecentInsights, mapInsightToWatcherFormat } from '../services/systemInsightsService.js';
import { runSystemWatcher } from '../orchestrator/systemWatcher.js';
import type { SystemWatcherInsightSeverity } from '../../packages/ai-types/src/systemWatcher.js';

const router = express.Router();

/**
 * POST /api/watcher/event
 * Record a system event
 */
router.post('/event', requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      source: z.enum(['device', 'orchestrator', 'dashboard']),
      type: z.string(),
      severity: z.enum(['info', 'low', 'medium', 'high', 'critical']).optional(),
      deviceId: z.string().optional(),
      tenantId: z.string().optional(),
      payload: z.any().optional(),
    });

    const input = schema.parse(req.body);

    await recordSystemEvent({
      source: input.source,
      type: input.type,
      severity: input.severity as SystemWatcherInsightSeverity | undefined,
      deviceId: input.deviceId,
      tenantId: input.tenantId || req.user?.tenantId,
      payload: input.payload,
    });

    res.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        error: 'Validation error',
        details: error.errors,
      });
    }
    next(error);
  }
});

/**
 * GET /api/watcher/insights
 * Get recent insights
 */
router.get('/insights', requireAuth, async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const insights = await getRecentInsights(limit);
    
    const mappedInsights = insights.map(mapInsightToWatcherFormat);

    res.json({
      ok: true,
      insights: mappedInsights,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/watcher/chat
 * Chat with the system watcher
 */
router.post('/chat', requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      question: z.string().optional(),
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
      filters: z.object({
        source: z.enum(['device', 'orchestrator', 'dashboard']).optional(),
      }).optional(),
    });

    const input = schema.parse(req.body);

    // Resolve time window (default: last 24h)
    const to = input.to ? new Date(input.to) : new Date();
    const from = input.from
      ? new Date(input.from)
      : new Date(to.getTime() - 24 * 60 * 60 * 1000);

    // Get events
    const events = await getRecentEvents({
      from,
      to,
      limit: 500,
      source: input.filters?.source,
    });

    // Compute aggregates
    const aggregates = computeAggregates(events);

    // Call orchestrator
    const result = await runSystemWatcher({
      question: input.question || null,
      events: events.map((e) => ({
        id: e.id,
        source: e.source,
        type: e.type,
        severity: e.severity,
        deviceId: e.deviceId,
        tenantId: e.tenantId,
        payload: e.payload,
        createdAt: e.createdAt.toISOString(),
      })),
      aggregates,
    });

    res.json({
      ok: true,
      result,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        error: 'Validation error',
        details: error.errors,
      });
    }
    next(error);
  }
});

export default router;

