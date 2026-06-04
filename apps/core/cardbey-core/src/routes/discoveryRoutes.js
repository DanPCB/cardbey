/**
 * Business Discovery / Ingestion routes (Phase 1).
 *
 *   GET  /api/discovery/business/search?q=&location=   → search permitted sources
 *   POST /api/discovery/business/import                → create unclaimed/draft record
 *   POST /api/discovery/business/:id/claim             → claim/verify (placeholder)
 *   POST /api/discovery/business/:id/generate-channel  → build a Cardbey store from imported data
 *   GET  /api/discovery/business/:id                   → fetch one record
 *
 * Ethics: search only hits permitted sources (official Places API when configured,
 * user-supplied website extraction, manual input). No Google page scraping.
 */

import express from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import {
  searchBusinesses,
  importBusiness,
  claimBusiness,
  getCandidateById,
  attachGeneratedStore,
  candidateToBuildStorePayload,
} from '../lib/businessDiscovery/index.js';
import { prisma } from '../lib/prisma.js';
import {
  createBuildStoreJob,
  runBuildStoreJob,
  newTraceId,
} from '../services/draftStore/orchestraBuildStore.js';

const router = express.Router();

/** GET /api/discovery/business/search?q=&location= */
router.get('/business/search', optionalAuth, async (req, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const location = typeof req.query.location === 'string' ? req.query.location : null;
    if (!q.trim()) {
      return res.status(400).json({ ok: false, error: 'missing_query', message: 'q is required' });
    }
    const result = await searchBusinesses({ q, location });
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error('[discovery] search error:', error);
    next(error);
  }
});

/** POST /api/discovery/business/import */
router.post('/business/import', optionalAuth, async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const result = await importBusiness({
      candidateId: body.candidateId ?? null,
      name: body.name ?? null,
      category: body.category ?? null,
      address: body.address ?? null,
      phone: body.phone ?? null,
      website: body.website ?? null,
      location: body.location ?? null,
      source: body.source ?? null,
      sourceUrl: body.sourceUrl ?? null,
      socialLinks: body.socialLinks ?? null,
      photos: body.photos ?? null,
      openingHours: body.openingHours ?? null,
      rating: body.rating ?? null,
      reviewCount: body.reviewCount ?? null,
      confidence: body.confidence ?? null,
    });
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (error) {
    console.error('[discovery] import error:', error);
    next(error);
  }
});

/** GET /api/discovery/business/:id */
router.get('/business/:id', optionalAuth, async (req, res, next) => {
  try {
    const record = await getCandidateById(req.params.id);
    if (!record) {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
    return res.status(200).json({ ok: true, candidate: record });
  } catch (error) {
    console.error('[discovery] get error:', error);
    next(error);
  }
});

/** POST /api/discovery/business/:id/claim */
router.post('/business/:id/claim', requireAuth, async (req, res, next) => {
  try {
    const body = req.body ?? {};
    // Phase 1 placeholder: real ownership verification (email/phone/domain) is not yet wired,
    // so unverified claims become `pending_verification`. A verified proof flips to `claimed`.
    const result = await claimBusiness(req.params.id, {
      userId: req.userId,
      verified: body.verified === true,
    });
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (error) {
    console.error('[discovery] claim error:', error);
    next(error);
  }
});

/** POST /api/discovery/business/:id/generate-channel (uses the existing build-store pipeline) */
router.post('/business/:id/generate-channel', requireAuth, async (req, res, next) => {
  try {
    const record = await getCandidateById(req.params.id);
    if (!record) {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
    if (!record.name) {
      return res.status(400).json({ ok: false, error: 'missing_business_name' });
    }

    const { sourceType, payload } = candidateToBuildStorePayload(record);
    const businessName = String(payload.businessName);
    const rawInput =
      [businessName, payload.businessType, payload.location].filter(Boolean).join(', ') ||
      businessName;
    const loc =
      typeof payload.location === 'string' && payload.location.trim()
        ? payload.location.trim()
        : undefined;

    const result = await createBuildStoreJob(prisma, {
      tenantId: req.userId,
      userId: req.userId,
      businessName,
      businessType: payload.businessType ?? undefined,
      storeType: payload.businessType ?? undefined,
      rawInput,
      location: loc,
      intentMode: 'store',
      sourceType,
      storeId: 'temp',
      includeImages: req.body?.autoImages !== false,
    });

    if (result.needRun && result.createdDraftId) {
      runBuildStoreJob(
        prisma,
        result.jobId,
        result.createdDraftId,
        result.generationRunId,
        newTraceId(),
        { originSurface: 'business_discovery' },
      );
    }

    await attachGeneratedStore(record.id, result.storeId);

    return res.status(200).json({
      ok: true,
      jobId: result.jobId,
      tenantId: result.tenantId,
      storeId: result.storeId,
      generationRunId: result.generationRunId,
      discoveryId: record.id,
    });
  } catch (error) {
    console.error('[discovery] generate-channel error:', error);
    next(error);
  }
});

export default router;
