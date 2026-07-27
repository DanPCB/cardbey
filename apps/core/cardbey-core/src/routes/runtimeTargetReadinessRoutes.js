/**
 * GET /api/runtime/target/readiness
 * Runtime Target Readiness — operational state for bound targets.
 */

import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRuntimeCapability } from '../lib/runtime/runtimeCapabilitiesService.js';
import { isRuntimeTargetReadinessEnabled } from '../lib/runtime/runtimeSessionService.js';
import { resolveTargetReadiness } from '../lib/runtime/runtimeTargetReadinessService.js';
import { getPrismaClient } from '../lib/prisma.js';
import { getTenantId } from '../lib/missionAccess.js';

const router = express.Router();

router.get('/readiness', requireAuth, async (req, res, next) => {
  try {
    const gate = requireRuntimeCapability('runtimeTargetReadiness', {
      source: 'runtime_target_readiness',
    });
    if (!gate.ok) {
      return res.status(503).json({
        ok: false,
        code: gate.code,
        capability: gate.capability,
        message: gate.message,
      });
    }
    if (!isRuntimeTargetReadinessEnabled()) {
      return res.status(503).json({
        ok: false,
        code: 'RUNTIME_CAPABILITY_UNAVAILABLE',
        capability: 'runtimeTargetReadiness',
        message: gate.message,
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    const q = req.query ?? {};
    const missionId = typeof q.missionId === 'string' ? q.missionId.trim() : '';
    const storeId = typeof q.storeId === 'string' ? q.storeId.trim() : '';
    const draftId = typeof q.draftId === 'string' ? q.draftId.trim() : '';
    const targetType = typeof q.targetType === 'string' ? q.targetType.trim() : 'store';

    let missionRow = null;
    if (missionId) {
      const prisma = getPrismaClient();
      const tenantId = getTenantId(req.user);
      missionRow = await prisma.missionPipeline.findUnique({
        where: { id: missionId },
        select: {
          id: true,
          type: true,
          targetId: true,
          targetType: true,
          metadataJson: true,
          outputsJson: true,
          createdBy: true,
          tenantId: true,
        },
      });
      if (
        missionRow &&
        missionRow.createdBy !== userId &&
        missionRow.tenantId !== userId &&
        missionRow.tenantId !== tenantId
      ) {
        missionRow = null;
      }
    }

    const readiness = await resolveTargetReadiness({
      targetType,
      targetId: storeId || null,
      userId,
      mission: missionRow,
      runtimeContext: { storeId, draftId, activeStoreId: storeId },
    });

    return res.status(200).json({ ok: true, readiness });
  } catch (err) {
    next(err);
  }
});

export default router;
