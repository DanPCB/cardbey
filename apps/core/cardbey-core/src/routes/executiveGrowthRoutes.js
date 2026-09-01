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
import {
  promoteLeadToSeed,
  runPromoteLeadsToDiscovery,
} from '../lib/executiveGrowth/promoteLeadToSeed.js';
import { isLegacyGrowthStoreCreationEnabled } from '../lib/executiveGrowth/growthGovernanceConfig.js';
import {
  admitInvestorOrganizations,
  approveInvestorHandoff,
  buildInvestorGrowthBoard,
  enrichGrowthInvestor,
  getInvestorGrowthDetail,
  prepareInvestorOutreachPack,
  prepareInvestorProfile,
  recordManualInvestorEvent,
  rejectInvestorHandoff,
  reviseInvestorHandoff,
  runInvestorDiscovery,
} from '../lib/executiveGrowth/growthInvestorService.js';

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

/** POST /api/executive/growth/promote-leads-to-discovery */
router.post('/promote-leads-to-discovery', async (req, res, next) => {
  try {
    const schema = z.object({
      name: z.string().trim().min(1),
      region: z.string().trim().nullable().optional(),
      category: z.string().trim().nullable().optional(),
      quantity: z.number().int().min(1).max(100),
      confirmed: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'validation_error', message: parsed.error.message });
    }
    const result = await runPromoteLeadsToDiscovery({
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

/** POST /api/executive/growth/promote-lead/:id */
router.post('/promote-lead/:id', async (req, res, next) => {
  try {
    const result = await promoteLeadToSeed({
      leadId: req.params.id,
      requestedBy: req.userId ?? null,
      batchName: typeof req.body?.batchName === 'string' ? req.body.batchName : null,
    });
    if (!result.ok) {
      const status = result.error === 'not_found' ? 404 : result.duplicate ? 409 : 400;
      return res.status(status).json(result);
    }
    return res.json({
      ok: true,
      message: result.message,
      seedId: result.seedId,
      status: result.status,
      discoveryJobId: result.discoveryJobId,
    });
  } catch (err) {
    next(err);
  }
});

/** POST /api/executive/growth/create-store-batch — legacy; gated by ENABLE_LEGACY_GROWTH_STORE_CREATION */
router.post('/create-store-batch', async (req, res, next) => {
  try {
    if (!isLegacyGrowthStoreCreationEnabled()) {
      return res.status(403).json({
        ok: false,
        error: 'legacy_disabled',
        message:
          'Store Auto-Creation Disabled — Discovery Engine V1 is now the canonical onboarding system. Use Discovery promotion instead.',
      });
    }
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

/** GET /api/executive/growth/investors */
router.get('/investors', async (_req, res, next) => {
  try {
    const board = await buildInvestorGrowthBoard();
    const status = board.error === 'flag_off' ? 403 : 200;
    return res.status(status).json(board);
  } catch (err) {
    next(err);
  }
});

/** GET /api/executive/growth/investors/:campaignId */
router.get('/investors/:campaignId', async (req, res, next) => {
  try {
    const detail = await getInvestorGrowthDetail(req.params.campaignId);
    if (detail.error === 'flag_off') return res.status(403).json(detail);
    if (detail.error === 'not_found') return res.status(404).json(detail);
    return res.json(detail);
  } catch (err) {
    next(err);
  }
});

/** POST /api/executive/growth/investors/discover */
router.post('/investors/discover', async (req, res, next) => {
  try {
    const schema = z.object({
      targetCount: z.number().int().min(1).max(50).optional(),
      geographies: z.array(z.string()).optional(),
      stages: z.array(z.string()).optional(),
      types: z.array(z.string()).optional(),
      themes: z.array(z.string()).optional(),
      chequeMin: z.number().nullable().optional(),
      chequeMax: z.number().nullable().optional(),
      canLead: z.union([z.literal('any'), z.boolean()]).optional(),
      dryRun: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'validation_error', message: parsed.error.message });
    }
    const result = await runInvestorDiscovery(parsed.data);
    const status = result.error === 'flag_off' ? 403 : 200;
    return res.status(status).json(result);
  } catch (err) {
    next(err);
  }
});

/** POST /api/executive/growth/investors/admit */
router.post('/investors/admit', async (req, res, next) => {
  try {
    const schema = z.object({
      catalogIds: z.array(z.string().trim().min(1)).min(1),
      confirmed: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'validation_error', message: parsed.error.message });
    }
    const result = await admitInvestorOrganizations(parsed.data.catalogIds, {
      confirmed: parsed.data.confirmed === true,
      requestedBy: req.userId ?? null,
    });
    if (result.error === 'flag_off') return res.status(403).json(result);
    if (result.requiresConfirmation) return res.status(400).json(result);
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

/** POST /api/executive/growth/investors/:campaignId/enrich */
router.post('/investors/:campaignId/enrich', async (req, res, next) => {
  try {
    const result = await enrichGrowthInvestor(req.params.campaignId, { actorId: req.userId ?? null });
    if (result.error === 'not_found') return res.status(404).json(result);
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    next(err);
  }
});

/** POST /api/executive/growth/investors/:campaignId/profile */
router.post('/investors/:campaignId/profile', async (req, res, next) => {
  try {
    const result = await prepareInvestorProfile(req.params.campaignId, { actorId: req.userId ?? null });
    if (result.error === 'not_found') return res.status(404).json(result);
    return res.status(result.ok ? 200 : 400).json({ ...result, sends: false, publishes: false });
  } catch (err) {
    next(err);
  }
});

/** POST /api/executive/growth/investors/:campaignId/outreach-pack */
router.post('/investors/:campaignId/outreach-pack', async (req, res, next) => {
  try {
    const result = await prepareInvestorOutreachPack(req.params.campaignId, { actorId: req.userId ?? null });
    if (result.error === 'not_found') return res.status(404).json(result);
    return res.status(result.ok ? 200 : 400).json({ ...result, sends: false, publishes: false });
  } catch (err) {
    next(err);
  }
});

/** POST /api/executive/growth/investors/:campaignId/handoff/approve */
router.post('/investors/:campaignId/handoff/approve', async (req, res, next) => {
  try {
    const result = await approveInvestorHandoff(req.params.campaignId, { actorId: req.userId ?? null });
    if (result.error === 'not_found') return res.status(404).json(result);
    return res.status(result.ok ? 200 : 400).json({ ...result, sends: false, publishes: false });
  } catch (err) {
    next(err);
  }
});

/** POST /api/executive/growth/investors/:campaignId/handoff/revise */
router.post('/investors/:campaignId/handoff/revise', async (req, res, next) => {
  try {
    const result = await reviseInvestorHandoff(req.params.campaignId, { actorId: req.userId ?? null });
    if (result.error === 'not_found') return res.status(404).json(result);
    return res.status(result.ok ? 200 : 400).json({ ...result, sends: false, publishes: false });
  } catch (err) {
    next(err);
  }
});

/** POST /api/executive/growth/investors/:campaignId/handoff/reject */
router.post('/investors/:campaignId/handoff/reject', async (req, res, next) => {
  try {
    const result = await rejectInvestorHandoff(req.params.campaignId, { actorId: req.userId ?? null });
    if (result.error === 'not_found') return res.status(404).json(result);
    return res.status(result.ok ? 200 : 400).json({ ...result, sends: false, publishes: false });
  } catch (err) {
    next(err);
  }
});

/** POST /api/executive/growth/investors/:campaignId/events */
router.post('/investors/:campaignId/events', async (req, res, next) => {
  try {
    const result = await recordManualInvestorEvent(req.params.campaignId, req.body ?? {}, {
      actorId: req.userId ?? null,
    });
    if (result.error === 'not_found') return res.status(404).json(result);
    return res.status(result.ok ? 200 : 400).json({ ...result, sends: false, publishes: false });
  } catch (err) {
    next(err);
  }
});

export default router;
