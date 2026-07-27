/**
 * Control Center discovery rollback API.
 * Soft rollback only — no owner outreach, no store publish, no hard deletes.
 */

import express from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import {
  runBatchRollbackDryRun,
  runBatchRollbackExecute,
  runBusinessRollbackDryRun,
  runBusinessRollbackExecute,
  listRollbackHistory,
} from '../lib/businessCandidate/rollback/rollbackService.js';
import { getRollbackJobById, listRollbackAuditForJob } from '../lib/businessCandidate/rollback/rollbackRepository.js';
import { hasRollbackDiscoveryPermission } from '../lib/businessCandidate/rollback/rollbackPermissions.js';

const router = express.Router();

function rollbackActorGuard(req, res, next) {
  if (!hasRollbackDiscoveryPermission(req.user)) {
    return res.status(403).json({
      ok: false,
      error: 'Insufficient permissions',
      code: 'forbidden',
      requiredPermission: 'control_center.rollback.discovery',
    });
  }
  return next();
}

router.use(requireAuth, requireAdmin, rollbackActorGuard);

/** POST /api/control-center/rollback/batch/dry-run */
router.post('/batch/dry-run', async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const batchId = typeof body.batchId === 'string' ? body.batchId.trim() : '';
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!batchId) return res.status(400).json({ ok: false, error: 'batchId is required' });
    if (!reason) return res.status(400).json({ ok: false, error: 'reason is required' });

    const result = await runBatchRollbackDryRun(
      {
        batchId,
        reason,
        includeQaApproved: body.includeQaApproved,
        includeClaimableSeeds: body.includeClaimableSeeds,
        includeBriefs: body.includeBriefs,
        includeMedia: body.includeMedia,
        includeClaimIntents: body.includeClaimIntents,
        force: body.force === true,
      },
      req.user,
    );

    if (!result.ok) {
      const status = result.code === 'forbidden' ? 403 : result.code === 'batch_protected' ? 400 : 400;
      return res.status(status).json(result);
    }

    return res.json({
      ok: true,
      dryRunJobId: result.preview.job.id,
      safetyLevel: result.preview.safetyLevel,
      affectedCounts: result.preview.affectedCounts,
      affectedRecords: result.preview.affectedRecords,
      blockedReasons: result.preview.blockedReasons,
      warnings: result.preview.warnings,
      requiredPermissions: result.preview.requiredPermissions,
      recommendedAction: result.preview.recommendedAction,
      job: result.preview.job,
    });
  } catch (err) {
    next(err);
  }
});

/** POST /api/control-center/rollback/batch/execute */
router.post('/batch/execute', async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const dryRunJobId = typeof body.dryRunJobId === 'string' ? body.dryRunJobId.trim() : '';
    if (!dryRunJobId) {
      return res.status(400).json({ ok: false, error: 'dryRunJobId is required (run dry-run first)' });
    }

    const result = await runBatchRollbackExecute(
      { dryRunJobId, reason: typeof body.reason === 'string' ? body.reason : undefined },
      req.user,
    );

    if (!result.ok) {
      const status =
        result.code === 'forbidden' || result.code === 'force_required'
          ? 403
          : result.code === 'dry_run_required' || result.code === 'blocked'
            ? 400
            : 400;
      return res.status(status).json(result);
    }

    return res.json({ ok: true, job: result.job });
  } catch (err) {
    next(err);
  }
});

/** POST /api/control-center/rollback/business/dry-run */
router.post('/business/dry-run', async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    const candidateId = typeof body.candidateId === 'string' ? body.candidateId : null;
    const seedId = typeof body.seedId === 'string' ? body.seedId : null;
    const storeId = typeof body.storeId === 'string' ? body.storeId : null;

    if (!reason) return res.status(400).json({ ok: false, error: 'reason is required' });
    if (!candidateId && !seedId && !storeId) {
      return res.status(400).json({ ok: false, error: 'candidateId, seedId, or storeId required' });
    }

    const result = await runBusinessRollbackDryRun(
      {
        candidateId,
        seedId,
        storeId,
        reason,
        includeBriefs: body.includeBriefs,
        includeMedia: body.includeMedia,
        includeClaimIntents: body.includeClaimIntents,
        force: body.force === true,
      },
      req.user,
    );

    if (!result.ok) {
      const status = result.code === 'forbidden' ? 403 : 400;
      return res.status(status).json(result);
    }

    return res.json({
      ok: true,
      dryRunJobId: result.preview.job.id,
      safetyLevel: result.preview.safetyLevel,
      affectedCounts: result.preview.affectedCounts,
      affectedRecords: result.preview.affectedRecords,
      blockedReasons: result.preview.blockedReasons,
      warnings: result.preview.warnings,
      requiredPermissions: result.preview.requiredPermissions,
      recommendedAction: result.preview.recommendedAction,
      job: result.preview.job,
    });
  } catch (err) {
    next(err);
  }
});

/** POST /api/control-center/rollback/business/execute */
router.post('/business/execute', async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const dryRunJobId = typeof body.dryRunJobId === 'string' ? body.dryRunJobId.trim() : '';
    if (!dryRunJobId) {
      return res.status(400).json({ ok: false, error: 'dryRunJobId is required (run dry-run first)' });
    }

    const result = await runBusinessRollbackExecute(
      { dryRunJobId, reason: typeof body.reason === 'string' ? body.reason : undefined },
      req.user,
    );

    if (!result.ok) {
      const status =
        result.code === 'forbidden' || result.code === 'force_required'
          ? 403
          : 400;
      return res.status(status).json(result);
    }

    return res.json({ ok: true, job: result.job });
  } catch (err) {
    next(err);
  }
});

/** GET /api/control-center/rollback/history */
router.get('/history', async (req, res, next) => {
  try {
    const limit = req.query.limit != null ? Number(req.query.limit) : 50;
    const jobs = await listRollbackHistory(limit);
    return res.json({ ok: true, jobs, total: jobs.length });
  } catch (err) {
    next(err);
  }
});

/** GET /api/control-center/rollback/jobs/:id */
router.get('/jobs/:id', async (req, res, next) => {
  try {
    const job = await getRollbackJobById(req.params.id);
    if (!job) return res.status(404).json({ ok: false, error: 'Job not found' });
    const audit = await listRollbackAuditForJob(job.id);
    return res.json({ ok: true, job, audit });
  } catch (err) {
    next(err);
  }
});

export default router;
