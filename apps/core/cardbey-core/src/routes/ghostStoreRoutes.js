/**
 * Ghost store create, claim, and report routes.
 */

import express from 'express';
import { optionalAuth, requireAuth, requireAdmin } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import {
  createGhostStore,
  submitGhostStoreClaim,
  submitGhostStoreReport,
  listGhostClaims,
  reviewGhostClaim,
  listEnrichedFieldProvenance,
} from '../lib/ghostStore/ghostStoreService.js';

const router = express.Router();

const claimRateLimit = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 3,
  keyGenerator: (req) => {
    const email = String(req.body?.claimantEmail ?? '').trim().toLowerCase();
    return `ghost-claim:${email || req.ip || 'unknown'}`;
  },
  message: 'Claim limit reached ({max} per day). Try again in {retryAfter} seconds.',
  code: 'ghost_claim_rate_limit',
});

const reportRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => `ghost-report:${req.ip ?? 'unknown'}`,
  code: 'ghost_report_rate_limit',
});

const createRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => `ghost-create:${req.user?.id ?? req.guestId ?? req.ip ?? 'unknown'}`,
  code: 'ghost_create_rate_limit',
});

/** POST /api/ghost-stores/create */
router.post('/create', optionalAuth, createRateLimit, async (req, res) => {
  try {
    const body = req.body ?? {};
    const route = await createGhostStore({
      extraction: body.extraction ?? {},
      location: body.location ?? null,
      visionEventId: body.visionEventId ?? body.eventId ?? null,
      imagePaths: body.imagePaths ?? [],
      userId: req.user?.id ?? req.guestId ?? null,
      missionId: body.missionId ?? null,
    });
    if (route.action === 'unsupported') {
      return res.status(400).json({ ok: false, error: route.message, route });
    }
    return res.json({ ok: true, route });
  } catch (err) {
    console.error('[ghost-stores/create]', err?.message ?? err);
    return res.status(500).json({ ok: false, error: 'discovered_business_create_failed' });
  }
});

export const ghostClaimRouter = express.Router();
ghostClaimRouter.post('/:storeId/claim', claimRateLimit, async (req, res) => {
  try {
    const result = await submitGhostStoreClaim(req.params.storeId, req.body ?? {});
    if (!result.ok) {
      return res.status(result.code === 'validation_error' ? 400 : 404).json(result);
    }
    return res.json(result);
  } catch (err) {
    console.error('[ghost-stores/claim]', err?.message ?? err);
    return res.status(500).json({ ok: false, error: 'ghost_claim_failed' });
  }
});

ghostClaimRouter.post('/:storeId/report', reportRateLimit, async (req, res) => {
  try {
    const result = await submitGhostStoreReport(req.params.storeId, req.body ?? {});
    if (!result.ok) {
      return res.status(result.code === 'validation_error' ? 400 : 404).json(result);
    }
    return res.json(result);
  } catch (err) {
    console.error('[ghost-stores/report]', err?.message ?? err);
    return res.status(500).json({ ok: false, error: 'ghost_report_failed' });
  }
});

export const adminGhostRouter = express.Router();
adminGhostRouter.use(requireAuth, requireAdmin);

/** GET /api/admin/ghost-claims */
adminGhostRouter.get('/ghost-claims', async (req, res) => {
  try {
    const claims = await listGhostClaims({ status: req.query.status });
    return res.json({ ok: true, claims });
  } catch (err) {
    console.error('[admin/ghost-claims]', err?.message ?? err);
    return res.status(500).json({ ok: false, error: 'ghost_claims_list_failed' });
  }
});

/** POST /api/admin/ghost-claims/:id/review */
adminGhostRouter.post('/ghost-claims/:id/review', async (req, res) => {
  try {
    const decision = req.body?.decision;
    if (decision !== 'approved' && decision !== 'rejected') {
      return res.status(400).json({ ok: false, error: 'decision must be approved or rejected' });
    }
    const result = await reviewGhostClaim(req.params.id, req.body ?? {}, req.user.id);
    if (!result.ok) {
      return res.status(404).json(result);
    }
    return res.json(result);
  } catch (err) {
    console.error('[admin/ghost-claims/review]', err?.message ?? err);
    return res.status(500).json({ ok: false, error: 'ghost_claim_review_failed' });
  }
});

/** GET /api/admin/ghost-stores/:storeId/provenance */
adminGhostRouter.get('/ghost-stores/:storeId/provenance', async (req, res) => {
  try {
    const rows = await listEnrichedFieldProvenance(req.params.storeId);
    return res.json({ ok: true, provenance: rows });
  } catch (err) {
    console.error('[admin/ghost-provenance]', err?.message ?? err);
    return res.status(500).json({ ok: false, error: 'ghost_provenance_list_failed' });
  }
});

export default router;
