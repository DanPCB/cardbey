/**
 * Store-scoped Business Growth Center API.
 * Mount: /api/stores/:storeId/growth
 * Owner-only — never exposes executive/platform acquisition data.
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { getPrismaClient } from '../lib/prisma.js';
import { rateLimitMiddleware } from '../services/reliability/rateLimitMiddleware.js';
import {
  buildStoreGrowthSummary,
  importStoreCustomers,
  listStoreLeadActivities,
  listStoreLeads,
  parseStoreCustomerCsv,
  sendStoreOutreach,
  updateStoreLead,
} from '../lib/businessGrowth/businessGrowthService.js';

const router = Router({ mergeParams: true });

const storeGrowthRateLimit = rateLimitMiddleware({
  endpoint: '/api/stores/:storeId/growth',
  windowMs: 60_000,
  maxRequests: 60,
  perUser: true,
});

async function requireStoreOwner(req, res, next) {
  try {
    const storeId = String(req.params.storeId ?? '').trim();
    if (!storeId) {
      return res.status(400).json({ ok: false, error: 'storeId required' });
    }
    const prisma = getPrismaClient();
    const store = await prisma.business.findUnique({
      where: { id: storeId },
      select: { id: true, userId: true, name: true, slug: true },
    });
    if (!store) {
      return res.status(404).json({ ok: false, error: 'Store not found' });
    }
    if (store.userId !== req.userId) {
      return res.status(403).json({ ok: false, error: 'Forbidden', message: 'You do not own this store' });
    }
    req.storeRecord = store;
    next();
  } catch (err) {
    next(err);
  }
}

router.use(requireAuth, storeGrowthRateLimit, requireStoreOwner);

const CustomerSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().nullable().optional(),
  phone: z.string().trim().nullable().optional(),
  source: z.string().trim().nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  notes: z.string().trim().nullable().optional(),
  consentStatus: z.string().trim().nullable().optional(),
  status: z.string().trim().nullable().optional(),
});

/** GET /api/stores/:storeId/growth/summary */
router.get('/summary', async (req, res, next) => {
  try {
    const summary = await buildStoreGrowthSummary(req.params.storeId, req.userId);
    return res.json({ ok: true, summary });
  } catch (err) {
    next(err);
  }
});

/** GET /api/stores/:storeId/growth/leads */
router.get('/leads', async (req, res, next) => {
  try {
    const leads = await listStoreLeads(req.params.storeId, req.userId, req.query);
    return res.json({ ok: true, leads });
  } catch (err) {
    next(err);
  }
});

/** GET /api/stores/:storeId/growth/activities */
router.get('/activities', async (req, res, next) => {
  try {
    const activities = await listStoreLeadActivities(req.params.storeId, req.userId);
    return res.json({ ok: true, activities });
  } catch (err) {
    next(err);
  }
});

/** POST /api/stores/:storeId/growth/import-leads */
router.post('/import-leads', async (req, res, next) => {
  try {
    const body = req.body ?? {};
    let customers = [];

    if (typeof body.csvText === 'string' && body.csvText.trim()) {
      customers = parseStoreCustomerCsv(body.csvText, body.source);
    } else if (Array.isArray(body.leads)) {
      customers = body.leads;
    } else if (body.lead && typeof body.lead === 'object') {
      customers = [body.lead];
    }

    if (customers.length > 100 && !body.confirmed) {
      return res.status(400).json({
        ok: false,
        requiresConfirmation: true,
        message: 'Importing more than 100 customers requires explicit confirmation',
      });
    }

    const parsed = customers.map((c) => CustomerSchema.safeParse(c)).filter((r) => r.success);
    const result = await importStoreCustomers(
      req.params.storeId,
      req.userId,
      parsed.map((r) => r.data),
      { source: body.source, createdBy: req.userId, skipDuplicates: body.skipDuplicates !== false },
    );
    return res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/stores/:storeId/growth/leads/:leadId */
router.patch('/leads/:leadId', async (req, res, next) => {
  try {
    const parsed = CustomerSchema.partial().extend({
      status: z.string().optional(),
      followUpDueAt: z.string().nullable().optional(),
    }).safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'validation_error', message: parsed.error.message });
    }
    const lead = await updateStoreLead(
      req.params.storeId,
      req.userId,
      req.params.leadId,
      parsed.data,
      req.userId,
    );
    return res.json({ ok: true, lead });
  } catch (err) {
    if ((err as Error).message === 'Lead not found') {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
    next(err);
  }
});

/** POST /api/stores/:storeId/growth/send-outreach */
router.post('/send-outreach', async (req, res, next) => {
  try {
    const schema = z.object({
      name: z.string().trim().min(1),
      templateId: z.string().trim().min(1),
      targetLeadIds: z.array(z.string()).min(1),
      offerSummary: z.string().optional().nullable(),
      testEmail: z.string().email().optional().nullable(),
      customBody: z.string().optional().nullable(),
      confirmed: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'validation_error', message: parsed.error.message });
    }
    const store = req.storeRecord;
    const result = await sendStoreOutreach({
      storeId: req.params.storeId,
      ownerId: req.userId,
      storeName: store.name,
      storeSlug: store.slug,
      ...parsed.data,
    });
    if (result.requiresConfirmation) {
      return res.status(400).json({ ok: false, ...result });
    }
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
