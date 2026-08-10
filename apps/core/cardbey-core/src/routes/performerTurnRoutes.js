/**
 * Canonical Performer reasoning endpoint.
 * POST /api/performer/turn — reasons only; never mutates CRM/booking.
 *
 * Also:
 * GET /api/performer/attention?storeId= — owner CRM read summary (auth required).
 */
import express from 'express';
import { z } from 'zod';

import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { getPrismaClient } from '../lib/prisma.js';
import {
  runPerformerTurnWithLlm,
  isPerformerTurnV1Enabled,
} from '../lib/performer/performerTurnWithLlm.js';
import {
  getQuoteRequestsForStore,
  countNewQuoteRequests,
} from '../lib/quoteRequest/quoteRequestService.js';
import { record as recordFoundationMetric } from '../lib/metrics/foundationMetrics.js';

const router = express.Router();

const TurnBodySchema = z.object({
  conversationId: z.string().min(1).max(200).optional(),
  message: z.string().min(1).max(4000),
  surface: z.enum(['storefront', 'dashboard', 'platform', 'unknown']).optional(),
  storeId: z.string().min(1).max(80).optional(),
  locale: z.string().max(32).optional(),
  collectedFacts: z.record(z.any()).optional(),
  availableCapabilities: z.array(z.string()).optional(),
  pageContext: z.record(z.any()).optional(),
  pendingJob: z.record(z.any()).optional(),
  actor: z.record(z.any()).optional(),
});

/**
 * POST /api/performer/turn
 */
router.post('/turn', optionalAuth, async (req, res) => {
  try {
    if (!isPerformerTurnV1Enabled()) {
      return res.status(503).json({
        ok: false,
        error: 'PERFORMER_TURN_DISABLED',
        message: 'Performer turn V1 is disabled on this environment.',
      });
    }

    const parsed = TurnBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'VALIDATION_ERROR',
        details: parsed.error.flatten(),
      });
    }

    const body = parsed.data;
    const storeId = String(body.storeId || body.pageContext?.storeId || '').trim();
    if (!storeId) {
      return res.status(400).json({ ok: false, error: 'STORE_ID_REQUIRED' });
    }

    // Owner attention shortcut (deterministic CRM read; auth + ownership required)
    const msg = body.message.trim();
    if (
      body.surface === 'dashboard' &&
      req.user?.id &&
      /\b(who needs|needs my attention|what needs attention|attention today)\b/i.test(msg)
    ) {
      const attention = await buildOwnerAttentionSummary(storeId, req.user.id);
      if (attention) {
        recordFoundationMetric('performer_turn_total', { source: 'owner_attention' });
        return res.json({
          ok: true,
          response: attention.response,
          intent: 'general',
          confidence: 1,
          collectedFacts: body.collectedFacts || {},
          missingFacts: [],
          provider: 'deterministic',
          model: 'owner_attention_v1',
          latencyMs: attention.latencyMs,
          notes: {
            pricingUnknown: false,
            grounding: 'exact',
            ownerAttention: attention.payload,
          },
        });
      }
    }

    const result = await runPerformerTurnWithLlm({
      conversationId: body.conversationId,
      message: body.message,
      surface: body.surface || 'storefront',
      storeId,
      collectedFacts: body.collectedFacts,
      availableCapabilities: body.availableCapabilities,
      locale: body.locale,
    });

    if (result == null) {
      // Soft-fail: client uses structured planner
      return res.status(200).json({
        ok: false,
        error: 'LLM_UNAVAILABLE',
        message: 'Conversational assistance is limited; use structured path.',
      });
    }

    if (result.ok === false && result.error) {
      return res.status(404).json(result);
    }

    return res.json(result);
  } catch (err) {
    console.error('[performer.turn] unexpected', err?.message);
    return res.status(200).json({
      ok: false,
      error: 'TURN_FAILED',
      message: 'Conversational assistance is limited; use structured path.',
    });
  }
});

/**
 * GET /api/performer/attention?storeId=
 * Read-only owner CRM summary.
 */
router.get('/attention', requireAuth, async (req, res, next) => {
  try {
    const storeId = String(req.query.storeId ?? '').trim();
    if (!storeId) {
      return res.status(400).json({ ok: false, error: 'STORE_ID_REQUIRED' });
    }
    const attention = await buildOwnerAttentionSummary(storeId, req.user?.id);
    if (!attention) {
      return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
    }
    return res.json({ ok: true, ...attention.payload, response: attention.response });
  } catch (err) {
    next(err);
  }
});

async function buildOwnerAttentionSummary(storeId, userId) {
  const started = Date.now();
  const prisma = getPrismaClient();
  const store = await prisma.business.findUnique({
    where: { id: storeId },
    select: { id: true, name: true, userId: true, isActive: true },
  });
  if (!store || store.isActive === false) return null;

  // V1: store owner only (Business.userId)
  if (userId && store.userId && store.userId !== userId) {
    return null;
  }

  const [newCount, recent] = await Promise.all([
    countNewQuoteRequests(storeId),
    getQuoteRequestsForStore(storeId, { limit: 20 }),
  ]);

  const rows = recent?.quoteRequests || [];
  const awaiting = rows.filter((r) => {
    const s = String(r.status || '').toLowerCase();
    return s === 'new' || s === 'reviewing';
  });
  // Oldest awaiting first (list is newest-first)
  const oldest =
    awaiting.length > 0 ? awaiting[awaiting.length - 1] : rows[0] || null;

  let bookingPending = 0;
  try {
    bookingPending = await prisma.booking.count({
      where: {
        storeId,
        status: { in: ['pending', 'pending_payment'] },
      },
    });
  } catch {
    bookingPending = 0;
  }

  const response =
    newCount === 0 && bookingPending === 0
      ? `Nothing urgent in CRM for ${store.name || 'your store'} right now.`
      : `You have ${newCount} new enquir${newCount === 1 ? 'y' : 'ies'}` +
        (awaiting.length ? `. ${awaiting.length} waiting for a response` : '') +
        (bookingPending
          ? `, and ${bookingPending} booking request${bookingPending === 1 ? '' : 's'} need confirmation`
          : '') +
        '.';

  return {
    latencyMs: Date.now() - started,
    response,
    payload: {
      storeId,
      storeName: store.name,
      newEnquiries: newCount,
      awaitingResponse: awaiting.length,
      bookingRequestsPending: bookingPending,
      nextActions: [
        oldest
          ? {
              type: 'open_enquiry',
              label: 'Open oldest enquiry',
              quoteRequestId: oldest.id,
            }
          : null,
        bookingPending
          ? { type: 'view_booking_requests', label: 'View booking request' }
          : null,
      ].filter(Boolean),
    },
  };
}

export default router;
