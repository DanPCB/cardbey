/**
 * Rich Media Acquisition API
 * Mount: /api/media-acquisition
 *
 * Discovers / reviews / acquires into Universal Library via URI federation.
 * Does not replace /api/discovery (business crawler).
 */

import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { optionalAuth, requireAuth, requireAdmin } from '../middleware/auth.js';
import {
  runFederatedMediaSearch,
  acquireCandidateToLibrary,
  addToReviewQueue,
  listReviewQueue,
  resolveReviewItem,
  getReviewItem,
  listMediaAcquisitionEvents,
  SOURCE_ROLE,
  DEFAULT_ACQUISITION_SOURCES,
} from '../services/mediaAcquisition/index.js';
import { bootstrapProviderAdapters } from '../services/universalResourceIntelligence/providerSdk/bootstrap.js';
import {
  ensureFederationReady,
  getAdapter,
  listAdapters,
} from '../services/universalResourceIntelligence/sourceFederation.js';
import { HOSTING_MODE } from '../services/universalLibrary/universalAssetTypes.js';

const router = Router();

/** GET /health */
router.get('/health', optionalAuth, async (_req, res) => {
  bootstrapProviderAdapters();
  await ensureFederationReady();
  return res.json({
    ok: true,
    service: 'rich_media_acquisition_v1',
    adapters: listAdapters(),
    acquisitionSources: DEFAULT_ACQUISITION_SOURCES,
    permanentHostingDefault: false,
  });
});

/** POST /search — federated media discovery */
router.post('/search', optionalAuth, async (req, res, next) => {
  try {
    const body = req.body || {};
    const result = await runFederatedMediaSearch({
      query: body.query || body.q,
      mediaType: body.mediaType || body.media,
      rightsFilter: body.rightsFilter || body.rights,
      source: body.source || body.provider,
      limitPerSource: body.limitPerSource,
    });
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    next(err);
  }
});

/** GET /sources — connector roster + roles */
router.get('/sources', optionalAuth, async (_req, res) => {
  bootstrapProviderAdapters();
  await ensureFederationReady();

  const acquisition = [];
  for (const sourceId of DEFAULT_ACQUISITION_SOURCES) {
    const adapter = getAdapter(sourceId);
    let health = null;
    try {
      health = adapter?.health ? await adapter.health() : null;
    } catch (err) {
      health = { ok: false, error: String(err?.message || err) };
    }
    const provider = sourceId.replace(/^src_/, '');
    acquisition.push({
      sourceId,
      provider,
      name: adapter?.manifest?.name || provider,
      role: SOURCE_ROLE.ACQUISITION_SOURCE,
      mediaTypes: adapter?.manifest?.kinds || [],
      configured: health?.configured !== false,
      health,
      rightsPolicy: adapter?.manifest?.rightsProfile || 'fail_closed',
    });
  }

  const referenceOnly = [
    { provider: 'tiktok', role: SOURCE_ROLE.BUSINESS_DISCOVERY },
    { provider: 'youtube', role: SOURCE_ROLE.REFERENCE_ONLY },
    { provider: 'instagram', role: SOURCE_ROLE.BUSINESS_DISCOVERY },
    { provider: 'facebook', role: SOURCE_ROLE.BUSINESS_DISCOVERY },
    { provider: 'website', role: SOURCE_ROLE.BUSINESS_DISCOVERY },
    { provider: 'google', role: SOURCE_ROLE.BUSINESS_DISCOVERY },
  ].map((s) => ({
    ...s,
    sourceId: `src_${s.provider}`,
    name: s.provider,
    note: 'DISCOVERY_ONLY — not acquireable stock media',
    canAcquire: false,
  }));

  return res.json({
    ok: true,
    acquisition,
    referenceOnly,
    legend: SOURCE_ROLE,
  });
});

/** GET /review */
router.get('/review', requireAuth, requireAdmin, (_req, res) => {
  return res.json({ ok: true, items: listReviewQueue() });
});

/** POST /review — add candidate */
router.post('/review', requireAuth, requireAdmin, (req, res) => {
  const candidate = req.body?.candidate || req.body;
  const result = addToReviewQueue(candidate, {
    proposedUse: req.body?.proposedUse,
    userId: req.user?.id,
  });
  return res.status(result.ok ? 200 : 400).json(result);
});

/** POST /review/:id/resolve */
router.post('/review/:id/resolve', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const action = String(req.body?.action || '').toLowerCase();
    if (!['approve', 'reference', 'reject'].includes(action)) {
      return res.status(400).json({ ok: false, error: 'invalid_action' });
    }
    const resolved = resolveReviewItem(req.params.id, action, {
      attributionText: req.body?.attributionText,
      userId: req.user?.id,
    });
    if (!resolved.ok) return res.status(400).json(resolved);

    if (resolved.next === 'acquire' || resolved.next === 'acquire_reference') {
      const acquired = await acquireCandidateToLibrary(prisma, resolved.item, {
        userId: req.user?.id,
        forceReference: resolved.next === 'acquire_reference',
        attributionText: req.body?.attributionText || resolved.item.attributionTextCaptured,
        skipPublish: resolved.next === 'acquire_reference',
      });
      return res.json({ ok: true, review: resolved.item, acquisition: acquired });
    }

    return res.json({ ok: true, review: resolved.item });
  } catch (err) {
    next(err);
  }
});

/** POST /acquire */
router.post('/acquire', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const candidate = req.body?.candidate || req.body;
    // Re-fetch review item if reviewId provided
    let c = candidate;
    if (req.body?.reviewId) {
      c = getReviewItem(req.body.reviewId) || candidate;
    }
    const result = await acquireCandidateToLibrary(prisma, c, {
      userId: req.user?.id,
      forceReference: req.body?.forceReference === true,
      attributionText: req.body?.attributionText,
    });
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    next(err);
  }
});

/** GET /library — thin bridge list from UniversalAsset (acquired channel) */
router.get('/library', optionalAuth, async (req, res, next) => {
  try {
    const mediaType = req.query.mediaType ? String(req.query.mediaType) : undefined;
    const provider = req.query.source || req.query.provider;
    const take = Math.min(Math.max(Number(req.query.limit) || 40, 1), 100);

    /** @type {Record<string, unknown>} */
    const where = {};
    if (mediaType && mediaType !== 'all') where.type = String(mediaType);
    if (provider && provider !== 'all') where.provider = String(provider);

    // Prefer assets tagged from this channel when possible
    const assets = await prisma.universalAsset.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take,
    });

    const items = assets.map((a) => {
      const meta = a.metadata && typeof a.metadata === 'object' ? a.metadata : {};
      const provenance = meta.provenance || {};
      return {
        id: a.id,
        title: a.title,
        mediaType: a.type,
        provider: a.provider,
        sourceUrl: a.sourceUrl,
        thumbnail: a.thumbnail,
        preview: a.preview,
        rightsStatus: a.rightsStatus,
        hostingMode: a.hostingMode || HOSTING_MODE.REFERENCE,
        custodyMode: provenance.custodyMode || meta.custodyMode || 'PROVIDER_HOSTED',
        qualityScore: a.qualityScore,
        license: a.license,
        collections: meta.collections || [],
        libraryUrl: `/library?asset=${a.id}`,
        acquiredAt: a.createdAt,
      };
    });

    return res.json({
      ok: true,
      items,
      bridge: '/library',
      note: 'Universal Library remains SSOT — this is a filtered bridge view',
    });
  } catch (err) {
    next(err);
  }
});

/** GET /events — observability */
router.get('/events', requireAuth, requireAdmin, (req, res) => {
  return res.json({
    ok: true,
    events: listMediaAcquisitionEvents({
      limit: Number(req.query.limit) || 50,
      type: req.query.type ? String(req.query.type) : undefined,
    }),
  });
});

export default router;
