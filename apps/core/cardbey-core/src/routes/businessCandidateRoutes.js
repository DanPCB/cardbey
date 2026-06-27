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
    return res.json({ ok: true, candidates, total: candidates.length, batchId: batchId ?? null });
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
