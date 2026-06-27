/**
 * Discovery Engine API — governed candidate → seed pipeline.
 * Admin-only for discover/manual/csv; referrals rate-limited for authenticated users.
 */

import express from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import {
  buildDiscoveryCenterMetrics,
  runDiscoveryEngine,
  runPerformerFirstDiscoveryEngine,
  buildBatch001OnboardingMetrics,
  listDiscoveryJobs,
  discoveryRegistry,
  registerDefaultDiscoveryProviders,
} from '../lib/discoveryEngine/index.ts';
import { ReferralRejectedError } from '../lib/discoveryEngine/providers/referralGuard.ts';
import {
  approveVisionScanCandidate,
  buildVisionDiscoveryMetrics,
  ignoreVisionScanCandidate,
  listVisionDiscoveryScans,
} from '../lib/visionDiscovery/visionDiscoveryService.ts';

const router = express.Router();

registerDefaultDiscoveryProviders();

const ADMIN_PROVIDERS = new Set(['osm', 'csv', 'manual', 'government_register', 'directory', 'partner_import']);

const discoveryRunRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => `discovery-run:${req.user?.id ?? req.ip ?? 'unknown'}`,
  message: 'Discovery run rate limit exceeded. Try again later.',
  code: 'discovery_run_rate_limit',
});

const referralRateLimit = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => `discovery-referral:${req.user?.id ?? req.ip ?? 'unknown'}`,
  message: 'Referral limit reached (5 per 24 hours).',
  code: 'discovery_referral_rate_limit',
});

/** GET /api/discovery-engine/metrics */
router.get('/metrics', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const metrics = await buildDiscoveryCenterMetrics();
    res.json({ ok: true, metrics });
  } catch (err) {
    next(err);
  }
});

/** GET /api/discovery-engine/jobs */
router.get('/jobs', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const limit = req.query.limit != null ? Number(req.query.limit) : 50;
    const jobs = await listDiscoveryJobs(limit);
    res.json({ ok: true, jobs });
  } catch (err) {
    next(err);
  }
});

/** GET /api/discovery-engine/providers */
router.get('/providers', requireAuth, requireAdmin, async (_req, res) => {
  res.json({ ok: true, providers: discoveryRegistry.listProviderIds() });
});

/** POST /api/discovery-engine/discover — platform admin only */
router.post('/discover', requireAuth, requireAdmin, discoveryRunRateLimit, async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const provider = body.provider;
    if (!provider || typeof provider !== 'string') {
      return res.status(400).json({ ok: false, error: 'provider is required' });
    }

    if (!ADMIN_PROVIDERS.has(provider)) {
      return res.status(400).json({ ok: false, error: 'provider not allowed on this endpoint' });
    }

    // Never accept server-side file paths from API (CLI only)
    if (body.csvPath) {
      return res.status(400).json({ ok: false, error: 'csvPath is not allowed via API; use POST /csv with csvContent' });
    }

    const result = await runDiscoveryEngine({
      provider,
      city: body.city,
      category: body.category,
      postcode: body.postcode,
      limit: body.limit != null ? Number(body.limit) : undefined,
      bbox: body.bbox,
      csvContent: body.csvContent,
      businessName: body.businessName,
      website: body.website,
      phone: body.phone,
      email: body.email,
      address: body.address,
      referredByUserId: body.referredByUserId ?? req.user?.id,
      region: body.region,
    });

    res.json({ ok: true, result });
  } catch (err) {
    next(err);
  }
});

/** GET /api/discovery-engine/batch-001/metrics — Performer-first Batch 001 runtime metrics */
router.get('/batch-001/metrics', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const metrics = await buildBatch001OnboardingMetrics();
    res.json({ ok: true, metrics });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/discovery-engine/batch-001/discover — Performer-first pipeline.
 * Creates BusinessCandidate + onboarding mission only (never Store/Seed).
 */
router.post('/batch-001/discover', requireAuth, requireAdmin, discoveryRunRateLimit, async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const provider = body.provider;
    if (!provider || typeof provider !== 'string') {
      return res.status(400).json({ ok: false, error: 'provider is required' });
    }
    if (!ADMIN_PROVIDERS.has(provider)) {
      return res.status(400).json({ ok: false, error: 'provider not allowed on this endpoint' });
    }
    if (body.csvPath) {
      return res.status(400).json({ ok: false, error: 'csvPath is not allowed via API; use csvContent' });
    }

    const result = await runPerformerFirstDiscoveryEngine({
      provider,
      city: body.city ?? body.suburb,
      category: body.category,
      postcode: body.postcode,
      limit: body.limit != null ? Number(body.limit) : undefined,
      bbox: body.bbox,
      csvContent: body.csvContent,
      businessName: body.businessName,
      website: body.website,
      phone: body.phone,
      email: body.email,
      address: body.address,
      region: body.region,
      batchId: body.batchId,
      createdBy: req.user?.id ?? null,
    });

    res.json({ ok: true, result, pipeline: 'performer_first' });
  } catch (err) {
    next(err);
  }
});

/** POST /api/discovery-engine/csv — platform admin CSV upload */
router.post('/csv', requireAuth, requireAdmin, discoveryRunRateLimit, async (req, res, next) => {
  try {
    const body = req.body ?? {};
    if (!body.csvContent || typeof body.csvContent !== 'string') {
      return res.status(400).json({ ok: false, error: 'csvContent is required' });
    }

    const result = await runDiscoveryEngine({
      provider: 'csv',
      csvContent: body.csvContent,
      limit: body.limit != null ? Number(body.limit) : undefined,
    });

    res.json({ ok: true, result });
  } catch (err) {
    next(err);
  }
});

/** POST /api/discovery-engine/referrals — authenticated users, strict rate limit */
router.post('/referrals', requireAuth, referralRateLimit, async (req, res, next) => {
  try {
    const body = req.body ?? {};
    if (!body.businessName) {
      return res.status(400).json({ ok: false, error: 'businessName is required' });
    }

    const result = await runDiscoveryEngine({
      provider: 'referral',
      businessName: body.businessName,
      website: body.website,
      phone: body.phone,
      email: body.email,
      address: body.address,
      city: body.city,
      category: body.category,
      referredByUserId: req.user?.id,
    });

    res.json({ ok: true, result });
  } catch (err) {
    if (err instanceof ReferralRejectedError) {
      return res.status(err.code === 'referral_rate_limit' ? 429 : 409).json({
        ok: false,
        error: err.code,
        message: err.message,
      });
    }
    next(err);
  }
});

/** POST /api/discovery-engine/manual — platform admin only */
router.post('/manual', requireAuth, requireAdmin, discoveryRunRateLimit, async (req, res, next) => {
  try {
    const body = req.body ?? {};
    if (!body.businessName) {
      return res.status(400).json({ ok: false, error: 'businessName is required' });
    }
    if (!body.website && !body.phone) {
      return res.status(400).json({ ok: false, error: 'website or phone is required for manual discovery' });
    }

    const result = await runDiscoveryEngine({
      provider: 'manual',
      businessName: body.businessName,
      website: body.website,
      phone: body.phone,
      email: body.email,
      address: body.address,
      city: body.city,
      category: body.category,
    });

    res.json({ ok: true, result });
  } catch (err) {
    next(err);
  }
});

/** GET /api/discovery-engine/vision-scans — admin list of vision-generated candidates */
router.get('/vision-scans', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const limit = req.query.limit != null ? Number(req.query.limit) : 100;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const scans = await listVisionDiscoveryScans({ limit, status });
    const metrics = await buildVisionDiscoveryMetrics();
    res.json({ ok: true, scans, metrics });
  } catch (err) {
    next(err);
  }
});

/** POST /api/discovery-engine/vision-scans/:id/approve */
router.post('/vision-scans/:id/approve', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const result = await approveVisionScanCandidate(req.params.id, req.user?.id ?? 'admin');
    if (!result.ok) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/** POST /api/discovery-engine/vision-scans/:id/ignore */
router.post('/vision-scans/:id/ignore', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const result = await ignoreVisionScanCandidate(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
