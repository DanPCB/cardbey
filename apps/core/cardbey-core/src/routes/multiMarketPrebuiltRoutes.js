/**
 * Multi-market discovery + public card + prebuilt draft + claim routes.
 * All gated by Features.multiMarketPrebuilt.* (default OFF).
 * Melbourne POST /api/business-candidates/real-local/discover is unchanged.
 */

import express from 'express';
import { Features } from '../config/features.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = express.Router();

function flagOff(res, flag) {
  return res.status(404).json({
    ok: false,
    error: 'feature_disabled',
    flag,
    message: 'Feature is disabled (default OFF).',
  });
}

const discoverRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => `mm-discover:${req.user?.id ?? req.ip ?? 'unknown'}`,
  message: 'Multi-market discovery rate limit exceeded.',
  code: 'multi_market_discovery_rate_limit',
});

const publicCorrectionRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => `mm-card-correction:${req.ip ?? 'unknown'}`,
  message: 'Correction rate limit exceeded.',
  code: 'public_card_correction_rate_limit',
});

const claimRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 15,
  keyGenerator: (req) => `mm-claim:${req.user?.id ?? req.ip ?? 'unknown'}`,
  message: 'Claim rate limit exceeded.',
  code: 'business_claim_rate_limit',
});

/** GET /api/markets — registry snapshot (requires master discovery flag) */
router.get('/markets', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    if (!Features.multiMarketPrebuilt.discoveryV1) {
      return flagOff(res, 'ENABLE_MULTI_MARKET_DISCOVERY_V1');
    }
    const { getMarketRegistrySnapshot } = await import('../lib/marketRegistry/index.js');
    const countries = [];
    if (Features.multiMarketPrebuilt.australiaDiscoveryV1) countries.push('AU');
    if (Features.multiMarketPrebuilt.vietnamDiscoveryV1) countries.push('VN');
    if (!countries.length) {
      return res.json({
        ok: true,
        enabled: false,
        message: 'Master flag on but no country flags enabled.',
        snapshot: { version: null, markets: [], territories: [], categories: [] },
      });
    }
    const snapshot = getMarketRegistrySnapshot({ countryCodes: countries });
    return res.json({ ok: true, enabled: true, snapshot });
  } catch (err) {
    next(err);
  }
});

/** GET /api/markets/:countryCode/territories */
router.get('/markets/:countryCode/territories', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    if (!Features.multiMarketPrebuilt.discoveryV1) {
      return flagOff(res, 'ENABLE_MULTI_MARKET_DISCOVERY_V1');
    }
    const code = String(req.params.countryCode || '').toUpperCase();
    if (code === 'AU' && !Features.multiMarketPrebuilt.australiaDiscoveryV1) {
      return flagOff(res, 'ENABLE_AUSTRALIA_DISCOVERY_V1');
    }
    if (code === 'VN' && !Features.multiMarketPrebuilt.vietnamDiscoveryV1) {
      return flagOff(res, 'ENABLE_VIETNAM_DISCOVERY_V1');
    }
    if (code !== 'AU' && code !== 'VN') {
      return res.status(400).json({ ok: false, error: 'invalid_country' });
    }
    const { listTerritories, childrenOf, buildCoverageSummary } = await import(
      '../lib/marketRegistry/index.js'
    );
    const parentId = typeof req.query.parentId === 'string' ? req.query.parentId : null;
    const territories = parentId ? childrenOf(parentId) : listTerritories(code);
    return res.json({
      ok: true,
      coverage: buildCoverageSummary(code),
      territories: territories.filter((t) => t.countryCode === code),
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/markets/:countryCode/categories */
router.get('/markets/:countryCode/categories', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    if (!Features.multiMarketPrebuilt.discoveryV1) {
      return flagOff(res, 'ENABLE_MULTI_MARKET_DISCOVERY_V1');
    }
    const code = String(req.params.countryCode || '').toUpperCase();
    if (code === 'AU' && !Features.multiMarketPrebuilt.australiaDiscoveryV1) {
      return flagOff(res, 'ENABLE_AUSTRALIA_DISCOVERY_V1');
    }
    if (code === 'VN' && !Features.multiMarketPrebuilt.vietnamDiscoveryV1) {
      return flagOff(res, 'ENABLE_VIETNAM_DISCOVERY_V1');
    }
    const { listCategories } = await import('../lib/marketRegistry/index.js');
    return res.json({ ok: true, categories: listCategories(code) });
  } catch (err) {
    next(err);
  }
});

/** POST /api/business-candidates/multi-market/prepare */
router.post(
  '/business-candidates/multi-market/prepare',
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      if (!Features.multiMarketPrebuilt.discoveryV1) {
        return flagOff(res, 'ENABLE_MULTI_MARKET_DISCOVERY_V1');
      }
      const body = req.body ?? {};
      const countryCode = String(body.countryCode || '').toUpperCase();
      if (countryCode === 'AU' && !Features.multiMarketPrebuilt.australiaDiscoveryV1) {
        return flagOff(res, 'ENABLE_AUSTRALIA_DISCOVERY_V1');
      }
      if (countryCode === 'VN' && !Features.multiMarketPrebuilt.vietnamDiscoveryV1) {
        return flagOff(res, 'ENABLE_VIETNAM_DISCOVERY_V1');
      }
      const { prepareAndPersistDiscoveryJob } = await import(
        '../lib/multiMarketDiscovery/index.js'
      );
      const job = await prepareAndPersistDiscoveryJob({
        countryCode,
        territoryId: body.territoryId,
        categoryId: body.categoryId,
        locality: body.locality,
        language: body.language,
        provider: body.provider,
        dryRun: body.dryRun !== false,
        slowMode: body.slowMode === true,
        requestedLimit: body.requestedLimit != null ? Number(body.requestedLimit) : 20,
        campaignId: body.campaignId ?? null,
        pilotId: body.pilotId ?? null,
        createdBy: req.user?.id ?? null,
      });
      return res.json({
        ok: true,
        job,
        warning:
          job.dryRun === false
            ? 'Non-dry-run will persist candidates. Confirm before execute.'
            : null,
        safety: { autoPublish: false, ownerContact: false },
      });
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('invalid_market_scope:')) {
        return res.status(400).json({ ok: false, error: err.message });
      }
      next(err);
    }
  },
);

/** POST /api/business-candidates/multi-market/discover */
router.post(
  '/business-candidates/multi-market/discover',
  requireAuth,
  requireAdmin,
  discoverRateLimit,
  async (req, res, next) => {
    try {
      if (!Features.multiMarketPrebuilt.discoveryV1) {
        return flagOff(res, 'ENABLE_MULTI_MARKET_DISCOVERY_V1');
      }
      const body = req.body ?? {};
      const countryCode = String(body.countryCode || '').toUpperCase();
      if (countryCode === 'AU' && !Features.multiMarketPrebuilt.australiaDiscoveryV1) {
        return flagOff(res, 'ENABLE_AUSTRALIA_DISCOVERY_V1');
      }
      if (countryCode === 'VN' && !Features.multiMarketPrebuilt.vietnamDiscoveryV1) {
        return flagOff(res, 'ENABLE_VIETNAM_DISCOVERY_V1');
      }
      if (body.dryRun === false && body.confirmLive !== true) {
        return res.status(400).json({
          ok: false,
          error: 'confirm_live_required',
          message: 'Set confirmLive:true for non-dry-run discovery.',
        });
      }
      const { runMultiMarketDiscovery } = await import('../lib/multiMarketDiscovery/index.js');
      const result = await runMultiMarketDiscovery({
        jobId: body.jobId,
        countryCode,
        territoryId: body.territoryId,
        categoryId: body.categoryId,
        locality: body.locality,
        language: body.language,
        provider: body.provider,
        dryRun: body.dryRun !== false,
        slowMode: body.slowMode === true,
        requestedLimit: body.requestedLimit != null ? Number(body.requestedLimit) : 20,
        campaignId: body.campaignId ?? null,
        pilotId: body.pilotId ?? null,
        createdBy: req.user?.id ?? null,
      });
      return res.json({
        ok: true,
        job: result.job,
        acceptedCount: result.accepted?.length ?? 0,
        safety: {
          autoStoreCreation: false,
          autoPublish: false,
          ownerOutreach: false,
        },
      });
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('invalid_market_scope:')) {
        return res.status(400).json({ ok: false, error: err.message });
      }
      next(err);
    }
  },
);

/** GET /api/business-candidates/multi-market/jobs/:jobId */
router.get(
  '/business-candidates/multi-market/jobs/:jobId',
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      if (!Features.multiMarketPrebuilt.discoveryV1) {
        return flagOff(res, 'ENABLE_MULTI_MARKET_DISCOVERY_V1');
      }
      const { getDiscoveryJobById, getMultiMarketJobMetrics } = await import(
        '../lib/multiMarketDiscovery/index.js'
      );
      const job = await getDiscoveryJobById(req.params.jobId);
      if (!job) return res.status(404).json({ ok: false, error: 'not_found' });
      const metrics = await getMultiMarketJobMetrics(job.countryCode);
      return res.json({ ok: true, job, metrics });
    } catch (err) {
      next(err);
    }
  },
);

/** GET /api/business-candidates/multi-market/metrics */
router.get(
  '/business-candidates/multi-market/metrics',
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      if (!Features.multiMarketPrebuilt.discoveryV1) {
        return flagOff(res, 'ENABLE_MULTI_MARKET_DISCOVERY_V1');
      }
      const { getMultiMarketJobMetrics } = await import('../lib/multiMarketDiscovery/index.js');
      const countryCode =
        typeof req.query.countryCode === 'string'
          ? req.query.countryCode.toUpperCase()
          : undefined;
      const metrics = await getMultiMarketJobMetrics(countryCode);
      return res.json({ ok: true, metrics });
    } catch (err) {
      next(err);
    }
  },
);

// ——— Public unclaimed cards ———

/** GET /api/public/business-cards/:slug */
router.get('/public/business-cards/:slug', async (req, res, next) => {
  try {
    if (!Features.multiMarketPrebuilt.publicUnclaimedBusinessCardsV1) {
      return flagOff(res, 'ENABLE_PUBLIC_UNCLAIMED_BUSINESS_CARDS_V1');
    }
    const { getPublicCardDto, getPublicBusinessCardBySlug } = await import(
      '../lib/publicBusinessCard/index.js'
    );
    const dto = await getPublicCardDto(req.params.slug);
    if (!dto) return res.status(404).json({ ok: false, error: 'not_found' });
    const indexingEnabled = Features.multiMarketPrebuilt.publicUnclaimedCardIndexingV1;
    const record = await getPublicBusinessCardBySlug(req.params.slug);
    const noindex = !indexingEnabled || record?.noindex === true;
    if (noindex) {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    }
    return res.json({
      ok: true,
      card: { ...dto, noindex, robots: noindex ? 'noindex,nofollow' : 'index,follow' },
    });
  } catch (err) {
    next(err);
  }
});

/** POST /api/public/business-cards/:slug/corrections */
router.post(
  '/public/business-cards/:slug/corrections',
  publicCorrectionRateLimit,
  async (req, res, next) => {
    try {
      if (!Features.multiMarketPrebuilt.publicUnclaimedBusinessCardsV1) {
        return flagOff(res, 'ENABLE_PUBLIC_UNCLAIMED_BUSINESS_CARDS_V1');
      }
      const { submitCorrection } = await import('../lib/publicBusinessCard/index.js');
      const body = req.body ?? {};
      const result = await submitCorrection(
        req.params.slug,
        body.message,
        body.reporterContact,
      );
      return res.json({ ok: true, correctionId: result.id });
    } catch (err) {
      next(err);
    }
  },
);

/** Admin prepare / publish / withdraw */
router.post(
  '/admin/public-business-cards/prepare',
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      if (!Features.multiMarketPrebuilt.publicUnclaimedBusinessCardsV1) {
        return flagOff(res, 'ENABLE_PUBLIC_UNCLAIMED_BUSINESS_CARDS_V1');
      }
      const { getBusinessCandidateById } = await import('../lib/businessCandidate/index.js');
      const { prepareCardFromCandidate } = await import('../lib/publicBusinessCard/index.js');
      const candidateId = req.body?.candidateId;
      const candidate = await getBusinessCandidateById(candidateId);
      if (!candidate) return res.status(404).json({ ok: false, error: 'candidate_not_found' });
      const card = await prepareCardFromCandidate(candidate, {
        qaApproved: req.body?.qaApproved === true,
      });
      return res.json({ ok: true, card, published: false });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/admin/public-business-cards/:id/publish',
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      if (!Features.multiMarketPrebuilt.publicUnclaimedBusinessCardsV1) {
        return flagOff(res, 'ENABLE_PUBLIC_UNCLAIMED_BUSINESS_CARDS_V1');
      }
      if (req.body?.confirmPublish !== true) {
        return res.status(400).json({
          ok: false,
          error: 'confirm_publish_required',
          message: 'Public card publish requires confirmPublish:true',
        });
      }
      const { publishCard } = await import('../lib/publicBusinessCard/index.js');
      const card = await publishCard(req.params.id, req.user?.id ?? 'admin');
      return res.json({ ok: true, card });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/admin/public-business-cards/:id/withdraw',
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      if (!Features.multiMarketPrebuilt.publicUnclaimedBusinessCardsV1) {
        return flagOff(res, 'ENABLE_PUBLIC_UNCLAIMED_BUSINESS_CARDS_V1');
      }
      if (req.body?.confirmWithdraw !== true) {
        return res.status(400).json({
          ok: false,
          error: 'confirm_withdraw_required',
        });
      }
      const { withdrawCard } = await import('../lib/publicBusinessCard/index.js');
      const card = await withdrawCard(req.params.id, req.user?.id ?? 'admin');
      return res.json({ ok: true, card });
    } catch (err) {
      next(err);
    }
  },
);

// ——— Prebuilt drafts ———

router.post(
  '/business-candidates/:id/prebuilt-draft/generate',
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      if (!Features.multiMarketPrebuilt.prebuiltStoreDraftsV1) {
        return flagOff(res, 'ENABLE_PREBUILT_STORE_DRAFTS_V1');
      }
      const { getBusinessCandidateById } = await import('../lib/businessCandidate/index.js');
      const { generateDraftFromCandidate, createPreviewToken } = await import(
        '../lib/prebuiltStore/index.js'
      );
      const candidate = await getBusinessCandidateById(req.params.id);
      if (!candidate) return res.status(404).json({ ok: false, error: 'candidate_not_found' });
      const draft = await generateDraftFromCandidate(candidate, {
        allowAiSuggestions: Features.multiMarketPrebuilt.prebuiltStoreAiSuggestionsV1,
      });
      const { token, record } = await createPreviewToken({ draftId: draft.id });
      return res.json({
        ok: true,
        draftId: draft.id,
        status: draft.status,
        previewToken: token,
        expiresAt: record.expiresAt,
        publicFeedExcluded: true,
      });
    } catch (err) {
      next(err);
    }
  },
);

router.get('/prebuilt-drafts/preview', async (req, res, next) => {
  try {
    if (!Features.multiMarketPrebuilt.prebuiltStoreDraftsV1) {
      return flagOff(res, 'ENABLE_PREBUILT_STORE_DRAFTS_V1');
    }
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    if (!token) return res.status(400).json({ ok: false, error: 'token_required' });
    const { getDraftByPreviewToken } = await import('../lib/prebuiltStore/index.js');
    const draft = await getDraftByPreviewToken(token);
    if (!draft) return res.status(404).json({ ok: false, error: 'invalid_or_expired_token' });
    return res.json({ ok: true, draft, publicFeedExcluded: true });
  } catch (err) {
    next(err);
  }
});

// ——— Claim ———

router.post('/claims/initiate', requireAuth, claimRateLimit, async (req, res, next) => {
  try {
    if (!Features.multiMarketPrebuilt.businessClaimV1) {
      return flagOff(res, 'ENABLE_BUSINESS_CLAIM_V1');
    }
    const { initiateClaim } = await import('../lib/prebuiltStore/index.js');
    const result = await initiateClaim({
      candidateId: req.body?.candidateId,
      cardId: req.body?.cardId,
    });
    return res.json({
      ok: true,
      claimToken: result.claimToken,
      claimId: result.record.id,
      status: result.record.status,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/claims/:token/verify', requireAuth, claimRateLimit, async (req, res, next) => {
  try {
    if (!Features.multiMarketPrebuilt.businessClaimV1) {
      return flagOff(res, 'ENABLE_BUSINESS_CLAIM_V1');
    }
    const { verifyClaimAuthority } = await import('../lib/prebuiltStore/index.js');
    const result = await verifyClaimAuthority({
      claimToken: req.params.token,
      proofType: req.body?.proofType,
      claimantId: req.user?.id ?? null,
    });
    return res.json({ ok: true, verified: result.verified, status: result.claim.status });
  } catch (err) {
    next(err);
  }
});

router.post('/claims/:token/confirm-convert', requireAuth, claimRateLimit, async (req, res, next) => {
  try {
    if (!Features.multiMarketPrebuilt.businessClaimV1) {
      return flagOff(res, 'ENABLE_BUSINESS_CLAIM_V1');
    }
    const { confirmAndConvert } = await import('../lib/prebuiltStore/index.js');
    const result = await confirmAndConvert({
      claimToken: req.params.token,
      claimantId: req.user?.id,
    });
    return res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});

export default router;
