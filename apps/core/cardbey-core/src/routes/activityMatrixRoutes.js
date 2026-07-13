/**
 * User Activity Matrix API routes.
 * GET /api/business/insights/activity-matrix
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { getPrismaClient } from '../lib/prisma.js';
import { assertStoreActivityAccess } from '../lib/storeActivity/storeActivityAccess.js';
import { rateLimitMiddleware } from '../services/reliability/rateLimitMiddleware.js';
import { buildActivityMatrix, listEventDefinitions } from '../lib/activityMatrix/activityMatrixService.js';

const router = Router();

const rateLimit = rateLimitMiddleware({
  endpoint: '/api/business/insights/activity-matrix',
  windowMs: 60_000,
  maxRequests: 60,
  perUser: true,
});

const QuerySchema = z.object({
  storeId: z.string().trim().min(1),
  event: z.string().trim().optional(),
  events: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined)),
  from: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
  to: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
  granularity: z.enum(['hour', 'day', 'week', 'month']).default('day'),
  userType: z.enum(['all', 'buyers', 'buyer', 'sellers', 'seller', 'owner', 'owners', 'store owners', 'guest', 'guests']).optional(),
  segment: z.string().optional(),
  state: z.string().optional(),
  search: z.string().optional(),
  minActiveIntervals: z.coerce.number().int().min(1).optional(),
  sort: z.enum(['active_desc', 'events_desc', 'name_asc', 'last_active']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  timezone: z.string().default('UTC'),
  compare: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
});

function normalizeUserType(raw) {
  if (!raw || raw === 'all') return undefined;
  const map = {
    buyer: 'buyer',
    buyers: 'buyer',
    seller: 'owner',
    sellers: 'owner',
    owner: 'owner',
    owners: 'owner',
    'store owners': 'owner',
    guest: 'guest',
    guests: 'guest',
  };
  return map[raw] ?? raw;
}

function parseDateParam(value, endOfDay = false) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return endOfDay ? new Date(`${value}T23:59:59.999Z`) : new Date(`${value}T00:00:00.000Z`);
  }
  return new Date(value);
}

/** GET /api/business/insights/activity-matrix */
router.get('/activity-matrix', requireAuth, rateLimit, async (req, res, next) => {
  try {
    const parsed = QuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'validation_error', details: parsed.error.flatten() });
    }

    const q = parsed.data;
    const access = await assertStoreActivityAccess(req, q.storeId);
    if (!access.ok) {
      return res.status(access.status).json({ ok: false, error: access.error });
    }

    const prisma = getPrismaClient();
    const from = parseDateParam(q.from);
    const to = parseDateParam(q.to, true);

    const eventList = q.events?.length ? q.events : q.event ? [q.event] : [];
    if (q.compare && eventList.length > 3) {
      return res.status(400).json({ ok: false, error: 'Compare mode supports up to 3 events' });
    }

    const result = await buildActivityMatrix(
      {
        event: q.event,
        events: eventList,
        from: from.toISOString(),
        to: to.toISOString(),
        granularity: q.granularity,
        userType: normalizeUserType(q.userType),
        segment: q.segment,
        state: q.state,
        search: q.search,
        minActiveIntervals: q.minActiveIntervals,
        sort: q.sort,
        cursor: q.cursor,
        limit: q.limit,
        timezone: q.timezone,
      },
      prisma,
      {
        scope: 'store',
        storeId: access.store.id,
        ownerUserId: access.store.userId,
      },
    );

    return res.json({ ok: true, ...result });
  } catch (err) {
    if (err.status === 400) {
      return res.status(400).json({ ok: false, error: err.message });
    }
    next(err);
  }
});

/** GET /api/business/insights/activity-matrix/events */
router.get('/activity-matrix/events', requireAuth, rateLimit, async (req, res) => {
  return res.json({ ok: true, events: listEventDefinitions('store') });
});

export default router;
