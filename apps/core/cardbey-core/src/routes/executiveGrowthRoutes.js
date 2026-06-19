/**
 * Executive Growth Command Center API routes.
 * Platform admin only — governed batch creation, import, audit, outreach.
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { rateLimitMiddleware } from '../services/reliability/rateLimitMiddleware.js';
import {
  buildGrowthSummaryMetrics,
  getGrowthBatchStatus,
  importExecutiveLeads,
  listExecutiveLeads,
  parseCsvLeads,
  runGrowthReadinessAudit,
  runGrowthStoreBatch,
  sendGrowthOutreach,
  updateExecutiveLead,
} from '../lib/executiveGrowth/growthCommandCenterService.js';

const router = Router();

const growthRateLimit = rateLimitMiddleware({
  endpoint: '/api/executive/growth',
  windowMs: 60_000,
  maxRequests: 40,
  perUser: true,
});

router.use(requireAuth, requireAdmin, growthRateLimit);

const LeadSchema = z.object({
  businessName: z.string().trim().min(1),
  ownerName: z.string().trim().nullable().optional(),
  email: z.string().trim().nullable().optional(),
  phone: z.string().trim().nullable().optional(),
  website: z.string().trim().nullable().optional(),
  category: z.string().trim().nullable().optional(),
  address: z.string().trim().nullable().optional(),
  addressLine2: z.string().trim().nullable().optional(),
  suburb: z.string().trim().nullable().optional(),
  city: z.string().trim().nullable().optional(),
  state: z.string().trim().nullable().optional(),
  postcode: z.string().trim().nullable().optional(),
  country: z.string().trim().nullable().optional(),
  lat: z.number().optional().nullable(),
  lng: z.number().optional().nullable(),
  source: z.string().trim().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
  consentStatus: z.string().trim().nullable().optional(),
  leadStatus: z.string().trim().nullable().optional(),
});

/** GET /api/executive/growth/summary */
router.get('/summary', async (_req, res, next) => {
  try {
    const summary = await buildGrowthSummaryMetrics();
    return res.json({ ok: true, summary });
  } catch (err) {
    next(err);
  }
});

/** GET /api/executive/growth/leads */
router.get('/leads', async (req, res, next) => {
  try {
    const leads = await listExecutiveLeads(req.query);
    return res.json({ ok: true, leads });
  } catch (err) {
    next(err);
  }
});

/** POST /api/executive/growth/import-leads */
router.post('/import-leads', async (req, res, next) => {
  try {
    const body = req.body ?? {};
    let leads = [];

    if (typeof body.csvText === 'string' && body.csvText.trim()) {
      leads = parseCsvLeads(body.csvText, body.source);
    } else if (Array.isArray(body.leads)) {
      leads = body.leads;
    } else if (body.lead && typeof body.lead === 'object') {
      leads = [body.lead];
    }

    if (leads.length > 100 && !body.confirmed) {
      return res.status(400).json({
        ok: false,
        requiresConfirmation: true,
        message: 'Importing more than 100 leads requires explicit confirmation',
      });
    }

    const parsed = leads.map((l) => LeadSchema.safeParse(l)).filter((r) => r.success);
    const result = await importExecutiveLeads(
      parsed.map((r) => r.data),
      { source: body.source, createdBy: req.userId ?? null, skipDuplicates: body.skipDuplicates !== false },
    );
    return res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/executive/growth/leads/:id */
router.patch('/leads/:id', async (req, res, next) => {
  try {
    const parsed = LeadSchema.partial().extend({ leadStatus: z.string().optional() }).safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'validation_error', message: parsed.error.message });
    }
    const lead = await updateExecutiveLead(req.params.id, parsed.data, req.userId ?? null);
    return res.json({ ok: true, lead });
  } catch (err) {
    next(err);
  }
});

/** POST /api/executive/growth/create-store-batch */
router.post('/create-store-batch', async (req, res, next) => {
  try {
    const schema = z.object({
      name: z.string().trim().min(1),
      region: z.string().trim().nullable().optional(),
      category: z.string().trim().nullable().optional(),
      quantity: z.number().int().min(1).max(100),
      autoCreateMode: z.enum(['draft_only', 'draft_review', 'draft_outreach']).optional(),
      requireReview: z.boolean().optional(),
      confirmed: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'validation_error', message: parsed.error.message });
    }
    const result = await runGrowthStoreBatch({
      ...parsed.data,
      requestedBy: req.userId ?? null,
    });
    if (result.requiresConfirmation) {
      return res.status(400).json({ ok: false, ...result });
    }
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

/** POST /api/executive/growth/audit-readiness */
router.post('/audit-readiness', async (_req, res, next) => {
  try {
    const audit = await runGrowthReadinessAudit();
    return res.json({ ok: true, audit });
  } catch (err) {
    next(err);
  }
});

/** POST /api/executive/growth/send-outreach */
router.post('/send-outreach', async (req, res, next) => {
  try {
    const schema = z.object({
      name: z.string().trim().min(1),
      templateId: z.string().trim().min(1),
      targetLeadIds: z.array(z.string()).min(1),
      testEmail: z.string().email().optional().nullable(),
      customBody: z.string().optional().nullable(),
      confirmed: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'validation_error', message: parsed.error.message });
    }
    const result = await sendGrowthOutreach({
      ...parsed.data,
      requestedBy: req.userId ?? null,
    });
    if (result.requiresConfirmation) {
      return res.status(400).json({ ok: false, ...result });
    }
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

/** GET /api/executive/growth/batch-status/:id */
router.get('/batch-status/:id', async (req, res, next) => {
  try {
    const batch = await getGrowthBatchStatus(req.params.id);
    if (!batch) return res.status(404).json({ ok: false, error: 'not_found' });
    return res.json({ ok: true, batch });
  } catch (err) {
    next(err);
  }
});

export default router;
