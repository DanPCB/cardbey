/**
 * Phase 1A alias surface for multi-market discovery.
 * Canonical paths remain under /api/markets and /api/business-candidates/multi-market/*.
 * This mounts the acceptance path: /api/discovery/multi-market/*
 * All gated by Features.multiMarketPrebuilt (default OFF).
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
  keyGenerator: (req) => `mm-discover-alias:${req.user?.id ?? req.ip ?? 'unknown'}`,
  message: 'Multi-market discovery rate limit exceeded.',
  code: 'multi_market_discovery_rate_limit',
});

/** GET /api/discovery/multi-market/markets */
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
        message: 'Master flag on but no country flags enabled (ENABLE_AUSTRALIA_DISCOVERY_V1 / ENABLE_VIETNAM_DISCOVERY_V1).',
        snapshot: { version: null, markets: [], territories: [], categories: [] },
        safety: { autoStore: false, autoPublish: false, ownerContact: false },
      });
    }
    const snapshot = getMarketRegistrySnapshot({ countryCodes: countries });
    return res.json({
      ok: true,
      enabled: true,
      snapshot,
      safety: { autoStore: false, autoPublish: false, ownerContact: false },
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/discovery/multi-market/categories/:market (au|vn|AU|VN) */
router.get('/categories/:market', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    if (!Features.multiMarketPrebuilt.discoveryV1) {
      return flagOff(res, 'ENABLE_MULTI_MARKET_DISCOVERY_V1');
    }
    const raw = String(req.params.market || '').toLowerCase();
    const code = raw === 'au' || raw === 'australia' ? 'AU' : raw === 'vn' || raw === 'vietnam' ? 'VN' : null;
    if (!code) return res.status(400).json({ ok: false, error: 'invalid_market' });
    if (code === 'AU' && !Features.multiMarketPrebuilt.australiaDiscoveryV1) {
      return flagOff(res, 'ENABLE_AUSTRALIA_DISCOVERY_V1');
    }
    if (code === 'VN' && !Features.multiMarketPrebuilt.vietnamDiscoveryV1) {
      return flagOff(res, 'ENABLE_VIETNAM_DISCOVERY_V1');
    }
    const { listCategories } = await import('../lib/marketRegistry/index.js');
    const categories = listCategories(code);
    const byGroup = {};
    for (const c of categories) {
      const label = c.groupLabel || c.groupId || 'Other';
      if (!byGroup[label]) byGroup[label] = [];
      byGroup[label].push({
        id: c.id,
        displayName: c.displayName,
        displayNameVi: c.displayNameVi ?? null,
      });
    }
    return res.json({ ok: true, market: code, categories, byGroup });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/discovery/multi-market/discover
 * Dry-run by default. Live requires confirmLive:true.
 * No auto-store / publish / owner contact.
 */
router.post('/discover', requireAuth, requireAdmin, discoverRateLimit, async (req, res, next) => {
  try {
    if (!Features.multiMarketPrebuilt.discoveryV1) {
      return flagOff(res, 'ENABLE_MULTI_MARKET_DISCOVERY_V1');
    }
    const body = req.body ?? {};
    const countryCode = String(body.countryCode || body.market || '')
      .toUpperCase()
      .replace(/^AUSTRALIA$/, 'AU')
      .replace(/^VIETNAM$/, 'VN');
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
      categoryId: body.categoryId || body.category,
      locality: body.locality || body.suburb,
      language: body.language,
      provider: body.provider,
      dryRun: body.dryRun !== false,
      slowMode: body.slowMode === true,
      requestedLimit: body.requestedLimit != null ? Number(body.requestedLimit) : body.maxResults != null ? Number(body.maxResults) : 20,
      campaignId: body.campaignId ?? null,
      pilotId: body.pilotId ?? null,
      createdBy: req.user?.id ?? null,
    });
    return res.json({
      ok: true,
      ...result,
      safety: {
        autoStore: false,
        autoPublish: false,
        ownerContact: false,
      },
    });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('invalid_market_scope:')) {
      return res.status(400).json({ ok: false, error: err.message });
    }
    next(err);
  }
});

export default router;
