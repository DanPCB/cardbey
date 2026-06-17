/**
 * Public Discovery Card API — marketplace-facing discovered businesses.
 * GET /api/public/discovery/businesses
 *
 * No auth. Never exposes ingestion internals (seed status codes, source metadata, QA).
 */

import express from 'express';
import { listPublicDiscoveryCards } from '../lib/businessIngestion/DiscoveryCardService.js';
import { getPublicBusinessProfileBySlug } from '../lib/businessIngestion/PublicBusinessProfileService.js';

const router = express.Router();

const VALID_CATEGORIES = new Set(['food', 'products', 'services', 'other']);

/** GET /api/public/discovery/businesses */
router.get('/discovery/businesses', async (req, res, next) => {
  try {
    const limit = Number(req.query.limit) || 20;
    const category =
      typeof req.query.category === 'string' && VALID_CATEGORIES.has(req.query.category.trim())
        ? req.query.category.trim()
        : undefined;

    const items = await listPublicDiscoveryCards({ limit, feedCategory: category });
    return res.status(200).json({
      ok: true,
      items,
      total: items.length,
    });
  } catch (error) {
    console.error('[public-discovery] list businesses error:', error);
    next(error);
  }
});

/** GET /api/public/discovery/businesses/:slug */
router.get('/discovery/businesses/:slug', async (req, res, next) => {
  try {
    const slug = String(req.params.slug ?? '').trim();
    if (!slug) {
      return res.status(400).json({ ok: false, message: 'Business slug is required.' });
    }

    const profile = await getPublicBusinessProfileBySlug(slug);
    if (!profile) {
      return res.status(404).json({ ok: false, message: 'Business profile not found.' });
    }

    return res.status(200).json({ ok: true, profile });
  } catch (error) {
    console.error('[public-discovery] business profile error:', error);
    next(error);
  }
});

export default router;
