/**
 * Public Discovery Card API — marketplace-facing discovered businesses.
 * GET /api/public/discovery/businesses
 *
 * No auth. Never exposes ingestion internals (seed status codes, source metadata, QA).
 */

import express from 'express';
import { listPublicDiscoveryCards } from '../lib/businessIngestion/DiscoveryCardService.js';
import { getPublicBusinessProfileBySlug } from '../lib/businessIngestion/PublicBusinessProfileService.js';
import { optionalAuth } from '../middleware/auth.js';
import { getBusinessCandidateBySeedId } from '../lib/businessCandidate/candidateRepository.js';
import { seedBriefCandidateId } from '../lib/businessCandidate/seedBriefAdapter.js';
import { findSeedByPublicSlug } from '../lib/businessIngestion/businessPublicSlug.js';
import { listSeedRecords } from '../lib/businessIngestion/IngestionRepository.js';
import { isSeedRolledBack } from '../lib/businessCandidate/rollback/isRolledBack.js';

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

    const seeds = await listSeedRecords();
    const seed = findSeedByPublicSlug(seeds, slug);
    if (seed && isSeedRolledBack(seed)) {
      return res.status(404).json({
        ok: false,
        message: 'This business preview is no longer available.',
        reason: 'rolled_back',
      });
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

async function resolveCandidateFromSlug(slug) {
  const seeds = await listSeedRecords();
  const seed = findSeedByPublicSlug(seeds, slug);
  if (!seed) return { seed: null, candidate: null, candidateId: null };
  const candidate = await getBusinessCandidateBySeedId(seed.id);
  return {
    seed,
    candidate,
    candidateId: candidate?.id ?? seedBriefCandidateId(seed.id),
  };
}

/** POST /api/public/discovery/businesses/:slug/brief/download-intent */
router.post('/discovery/businesses/:slug/brief/download-intent', optionalAuth, async (req, res, next) => {
  try {
    const slug = String(req.params.slug ?? '').trim();
    const { seed, candidateId } = await resolveCandidateFromSlug(slug);
    if (!seed || !candidateId) {
      return res.status(404).json({ ok: false, message: 'Business not found.' });
    }

    const { recordBriefDownloadIntent } = await import(
      '../lib/businessCandidate/brief/briefService.js'
    );
    const sessionId = req.headers['x-session-id'] ?? req.cookies?.['cardbey.session'] ?? null;
    const result = await recordBriefDownloadIntent({
      candidateId,
      seedId: seed.id,
      userId: req.user?.id ?? null,
      email: req.user?.email ?? null,
      sessionId: typeof sessionId === 'string' ? sessionId : null,
    });

    return res.status(result.ok ? 200 : 400).json(result);
  } catch (error) {
    next(error);
  }
});

/** GET /api/public/discovery/businesses/:slug/brief/download */
router.get('/discovery/businesses/:slug/brief/download', optionalAuth, async (req, res, next) => {
  try {
    const slug = String(req.params.slug ?? '').trim();
    const format = req.query.format === 'html' ? 'html' : 'markdown';
    const { seed, candidateId } = await resolveCandidateFromSlug(slug);
    if (!seed || !candidateId) {
      return res.status(404).json({ ok: false, message: 'Business not found.' });
    }

    const { downloadBriefIfAllowed } = await import('../lib/businessCandidate/brief/briefService.js');
    const sessionId = req.headers['x-session-id'] ?? req.cookies?.['cardbey.session'] ?? null;
    const result = await downloadBriefIfAllowed({
      candidateId,
      seedId: seed.id,
      userId: req.user?.id ?? null,
      sessionId: typeof sessionId === 'string' ? sessionId : null,
      format,
    });

    if (!result.ok) {
      return res.status(400).json(result);
    }
    if (result.action === 'registration_required' || result.action === 'claim_required') {
      return res.status(401).json(result);
    }

    const brief = result.brief;
    const filename = `business-intelligence-brief-${slug}.${format === 'html' ? 'html' : 'md'}`;
    const body = format === 'html' ? brief.generatedHtml ?? '' : brief.generatedMarkdown;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', format === 'html' ? 'text/html; charset=utf-8' : 'text/markdown; charset=utf-8');
    return res.send(body);
  } catch (error) {
    next(error);
  }
});

/** POST /api/public/discovery/seeds/:seedId/claim-intent */
router.post('/discovery/seeds/:seedId/claim-intent', optionalAuth, async (req, res, next) => {
  try {
    const seedId = String(req.params.seedId ?? '').trim();
    if (!seedId) {
      return res.status(400).json({ ok: false, message: 'Seed id is required.' });
    }

    const seed = (await listSeedRecords()).find((row) => row.id === seedId);
    if (!seed) {
      return res.status(404).json({ ok: false, message: 'Business not found.' });
    }

    const source = req.body?.source ?? 'CLAIM_BUTTON';
    const { recordClaimButtonIntent } = await import('../lib/businessCandidate/brief/briefService.js');
    const sessionId = req.headers['x-session-id'] ?? req.cookies?.['cardbey.session'] ?? null;
    const candidate = await getBusinessCandidateBySeedId(seed.id);
    await recordClaimButtonIntent({
      candidateId: candidate?.id ?? null,
      seedId: seed.id,
      userId: req.user?.id ?? null,
      sessionId: typeof sessionId === 'string' ? sessionId : null,
      source,
    });

    return res.json({ ok: true, claimUrl: `/activate-business/${seed.id}` });
  } catch (error) {
    next(error);
  }
});

/** POST /api/public/discovery/businesses/:slug/claim-intent */
router.post('/discovery/businesses/:slug/claim-intent', optionalAuth, async (req, res, next) => {
  try {
    const slug = String(req.params.slug ?? '').trim();
    const source = req.body?.source ?? 'CLAIM_BUTTON';
    const { seed, candidate, candidateId } = await resolveCandidateFromSlug(slug);
    if (!seed) {
      return res.status(404).json({ ok: false, message: 'Business not found.' });
    }

    const { recordClaimButtonIntent } = await import('../lib/businessCandidate/brief/briefService.js');
    const sessionId = req.headers['x-session-id'] ?? req.cookies?.['cardbey.session'] ?? null;
    await recordClaimButtonIntent({
      candidateId: candidate?.id ?? null,
      seedId: seed.id,
      userId: req.user?.id ?? null,
      sessionId: typeof sessionId === 'string' ? sessionId : null,
      source,
    });

    return res.json({ ok: true, claimUrl: `/activate-business/${seed.id}` });
  } catch (error) {
    next(error);
  }
});

export default router;
