/**
 * BusinessCandidate API — QA review, real local pilot metrics.
 * No auto-store creation. No owner outreach.
 */

import express from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import {
  listCandidatesPendingQa,
  approveCandidateForClaiming,
  rejectCandidateQa,
} from '../lib/businessCandidate/candidateQaService.js';
import {
  buildBatchOnboardingMetrics,
  getBusinessCandidateById,
  listBusinessCandidatesByBatch,
  MELBOURNE_BATCH001_REAL_LOCAL_ID,
} from '../lib/businessCandidate/index.js';
import {
  runRealLocalDiscovery,
  REAL_LOCAL_PILOT_TARGET_COUNT,
} from '../lib/businessCandidate/realLocalDiscoveryService.js';

const router = express.Router();

const realLocalRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => `real-local-discovery:${req.user?.id ?? req.ip ?? 'unknown'}`,
  message: 'Real local discovery rate limit exceeded.',
  code: 'real_local_discovery_rate_limit',
});

/** GET /api/business-candidates/qa */
router.get('/qa', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const batchId = typeof req.query.batchId === 'string' ? req.query.batchId : undefined;
    const candidates = await listCandidatesPendingQa(batchId ?? null);
    const { selectBestCandidateMedia } = await import(
      '../lib/businessCandidate/media/selectBestCandidateMedia.js'
    );
    const { getBriefByCandidateId } = await import(
      '../lib/businessCandidate/brief/briefRepository.js'
    );
    const enriched = await Promise.all(
      candidates.map(async (c) => {
        const [media, brief] = await Promise.all([
          selectBestCandidateMedia(c.id),
          getBriefByCandidateId(c.id),
        ]);
        return {
          ...c,
          qaEnrichment: {
            mediaPreviewUrl: media?.heroImage?.thumbnailUrl ?? media?.heroImage?.url ?? null,
            mediaSource: media?.heroImage?.sourceType ?? null,
            mediaConfidence: media?.heroImage?.matchConfidence ?? null,
            isRepresentative: media?.representativeDisclosureRequired ?? false,
            briefStatus: brief?.status ?? 'not_generated',
            briefUpdatedAt: brief?.updatedAt ?? null,
          },
        };
      }),
    );
    return res.json({ ok: true, candidates: enriched, total: enriched.length, batchId: batchId ?? null });
  } catch (err) {
    next(err);
  }
});

/** GET /api/business-candidates/batch-001/metrics */
router.get('/batch-001/metrics', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const batchId =
      typeof req.query.batchId === 'string' ? req.query.batchId : MELBOURNE_BATCH001_REAL_LOCAL_ID;
    const metrics = await buildBatchOnboardingMetrics(batchId);
    return res.json({ ok: true, metrics, batchId });
  } catch (err) {
    next(err);
  }
});

/** POST /api/business-candidates/real-local/discover — Growth Command Center pilot */
router.post('/real-local/discover', requireAuth, requireAdmin, realLocalRateLimit, async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const batchId =
      typeof body.batchId === 'string' && body.batchId.trim()
        ? body.batchId.trim()
        : MELBOURNE_BATCH001_REAL_LOCAL_ID;

    const result = await runRealLocalDiscovery({
      batchId,
      suburbs: Array.isArray(body.suburbs) ? body.suburbs : undefined,
      categories: Array.isArray(body.categories) ? body.categories : undefined,
      maxResults: body.maxResults != null ? Number(body.maxResults) : REAL_LOCAL_PILOT_TARGET_COUNT,
      dryRun: body.dryRun === true,
      provider: body.provider,
      slowMode: body.slowMode === true,
      retryRateLimited: Array.isArray(body.retryRateLimited) ? body.retryRateLimited : undefined,
      createdBy: req.user?.id ?? null,
    });

    return res.json({
      ok: true,
      result,
      label: 'Real local business pilot',
      safety: {
        autoStoreCreation: false,
        autoPublish: false,
        ownerOutreach: false,
      },
    });
  } catch (err) {
    next(err);
  }
});

const multiSourceEnrichRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => `candidate-multisource-enrich:${req.user?.id ?? req.ip ?? 'unknown'}`,
  message: 'Multi-source enrichment rate limit exceeded.',
  code: 'candidate_multisource_enrich_rate_limit',
});

/**
 * POST /api/business-candidates/enrich/multi-source
 * Opt-in only — same auth gate as /api/intelligence/metrics (requireAuth + requireAdmin).
 * Body: { batchId: string (required), dryRun?: boolean (default true), candidateIds?: string[], maxCandidates?: number }
 *
 * Live runs (dryRun=false) are rejected for batches > 3 candidates over HTTP to avoid
 * multi-minute blocking requests. Use the CLI script for larger live batches.
 * Concurrent in-process runs are rejected while another enrichment is active.
 */
let enrichmentHttpLock = false;

router.post(
  '/enrich/multi-source',
  requireAuth,
  requireAdmin,
  multiSourceEnrichRateLimit,
  async (req, res, next) => {
    try {
      const body = req.body ?? {};
      const batchId = typeof body.batchId === 'string' ? body.batchId.trim() : '';
      if (!batchId) {
        return res.status(400).json({
          ok: false,
          error: 'batchId_required',
          message: 'batchId is required — refusing to enrich all candidates.',
        });
      }

      // Default dry-run for HTTP safety; live requires explicit dryRun:false
      const dryRun = body.dryRun !== false ? true : false;
      const maxCandidates =
        body.maxCandidates != null ? Math.min(Math.max(Number(body.maxCandidates) || 1, 1), 25) : 25;

      if (!dryRun && maxCandidates > 3) {
        return res.status(400).json({
          ok: false,
          error: 'live_http_batch_too_large',
          message:
            'Live enrichment over HTTP is limited to maxCandidates<=3. Use pnpm enrich:candidates for larger live batches.',
        });
      }

      if (enrichmentHttpLock) {
        return res.status(409).json({
          ok: false,
          error: 'enrichment_in_progress',
          message: 'Another enrichment run is already in progress in this process.',
        });
      }

      enrichmentHttpLock = true;
      try {
        const { runMultiSourceEnrichmentBatch, isProtectedEnrichmentBatch } = await import(
          '../lib/businessCandidate/enrichment/runBatchEnrichment.js'
        );
        if (isProtectedEnrichmentBatch(batchId)) {
          return res.status(400).json({
            ok: false,
            error: 'protected_batch',
            message: `Refusing protected batch ${batchId}`,
          });
        }

        const result = await runMultiSourceEnrichmentBatch({
          batchId,
          dryRun,
          maxCandidates,
          candidateIds: Array.isArray(body.candidateIds)
            ? body.candidateIds.filter((id) => typeof id === 'string')
            : undefined,
          writeReport: body.writeReport !== false,
        });

        return res.json({
          ok: true,
          mode: dryRun ? 'DRY_RUN' : 'LIVE',
          enrichmentRunId: result.enrichmentRunId,
          batchId: result.batchId,
          summary: result.summary,
          results: result.results,
          safety: {
            writesBusinessSeed: false,
            writesBusiness: false,
            writesDraftStore: false,
            autoQaApprove: false,
            protectedBatch0SkippedInLoop: true,
            dryRunDefault: true,
            httpLiveCap: 3,
            concurrentLock: true,
          },
        });
      } finally {
        enrichmentHttpLock = false;
      }
    } catch (err) {
      next(err);
    }
  },
);

/** POST /api/business-candidates/batch/qa-approve — bulk approve pending QA (makes claimable) */
router.post('/batch/qa-approve', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const candidateIds = Array.isArray(body.candidateIds)
      ? body.candidateIds.filter((id) => typeof id === 'string')
      : undefined;
    const batchId = typeof body.batchId === 'string' ? body.batchId : null;
    const reason = typeof body.reason === 'string' ? body.reason : null;

    const { bulkApproveCandidatesForClaiming } = await import(
      '../lib/businessCandidate/candidateQaService.js'
    );
    const result = await bulkApproveCandidatesForClaiming({
      candidateIds,
      batchId,
      reviewerId: req.user?.id ?? 'admin',
      reason,
    });

    return res.json({ ok: result.ok, ...result });
  } catch (err) {
    next(err);
  }
});

/** GET /api/business-candidates/batch/:batchId */
router.get('/batch/:batchId', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const candidates = await listBusinessCandidatesByBatch(req.params.batchId);
    return res.json({ ok: true, candidates, total: candidates.length });
  } catch (err) {
    next(err);
  }
});

/** POST /api/business-candidates/:id/qa-approve */
router.post('/:id/qa-approve', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : null;
    const result = await approveCandidateForClaiming({
      candidateId: req.params.id,
      reviewerId: req.user?.id ?? 'admin',
      reason,
    });
    if (!result.ok) {
      return res.status(result.message.includes('not found') ? 404 : 409).json(result);
    }
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

/** POST /api/business-candidates/:id/qa-reject */
router.post('/:id/qa-reject', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : null;
    const result = await rejectCandidateQa({
      candidateId: req.params.id,
      reviewerId: req.user?.id ?? 'admin',
      reason,
    });
    if (!result.ok) {
      return res.status(result.message.includes('not found') ? 404 : 409).json(result);
    }
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

/** GET /api/business-candidates/:id/brief */
router.get('/:id/brief', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { getOrGenerateBrief } = await import('../lib/businessCandidate/brief/briefService.js');
    const brief = await getOrGenerateBrief(req.params.id);
    if (!brief) return res.status(404).json({ ok: false, error: 'not_found' });
    return res.json({ ok: true, brief });
  } catch (err) {
    next(err);
  }
});

/** POST /api/business-candidates/:id/brief/generate */
router.post('/:id/brief/generate', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { getOrGenerateBrief } = await import('../lib/businessCandidate/brief/briefService.js');
    const brief = await getOrGenerateBrief(req.params.id, true);
    if (!brief) return res.status(404).json({ ok: false, error: 'not_found' });
    return res.json({ ok: true, brief });
  } catch (err) {
    next(err);
  }
});

/** POST /api/business-candidates/:id/media/discover */
router.post('/:id/media/discover', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const candidate = await getBusinessCandidateById(req.params.id);
    if (!candidate) return res.status(404).json({ ok: false, error: 'not_found' });
    const { runMediaDiscoveryForCandidate } = await import(
      '../lib/businessCandidate/media/mediaDiscoveryAgent.js'
    );
    const assets = await runMediaDiscoveryForCandidate(candidate);
    const { selectBestCandidateMedia } = await import(
      '../lib/businessCandidate/media/selectBestCandidateMedia.js'
    );
    const selected = await selectBestCandidateMedia(candidate.id, { discoverIfEmpty: false });
    return res.json({ ok: true, assets, selected });
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/business-candidates/media/:assetId/usage */
router.patch('/media/:assetId/usage', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const usageStatus = req.body?.usageStatus;
    if (!['approved', 'needs_review', 'blocked'].includes(usageStatus)) {
      return res.status(400).json({ ok: false, error: 'invalid_usage_status' });
    }
    const { updateMediaUsageStatus } = await import(
      '../lib/businessCandidate/media/mediaEvidenceRepository.js'
    );
    const updated = await updateMediaUsageStatus(req.params.assetId, usageStatus);
    if (!updated) return res.status(404).json({ ok: false, error: 'not_found' });
    return res.json({ ok: true, asset: updated });
  } catch (err) {
    next(err);
  }
});

/** GET /api/business-candidates/:id */
router.get('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const candidate = await getBusinessCandidateById(req.params.id);
    if (!candidate) {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
    return res.json({ ok: true, candidate });
  } catch (err) {
    next(err);
  }
});

export default router;
