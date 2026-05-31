/**
 * POST /api/runtime/missions/:missionId/steps/:stepNumber/execute
 * Runtime Kernel — authoritative proactive mission step execution.
 */

import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  executeMissionStep,
  isRuntimeStepExecutionEnabled,
} from '../lib/runtime/performerRuntimeKernel.js';
import { requireRuntimeCapability } from '../lib/runtime/runtimeCapabilitiesService.js';

const router = express.Router();

router.post('/:missionId/steps/:stepNumber/execute', requireAuth, async (req, res, next) => {
  try {
    const gate = requireRuntimeCapability('runtimeStepExecution', {
      source: 'runtime_step_execute',
      missionId: String(req.params.missionId ?? '').trim() || null,
    });
    if (!gate.ok) {
      return res.status(503).json({
        ok: false,
        code: gate.code,
        capability: gate.capability,
        message: gate.message,
      });
    }
    if (!isRuntimeStepExecutionEnabled()) {
      return res.status(503).json({
        ok: false,
        code: 'RUNTIME_CAPABILITY_UNAVAILABLE',
        capability: 'runtimeStepExecution',
        message: gate.message,
      });
    }

    const missionId = String(req.params.missionId ?? '').trim();
    const stepNumber = Math.floor(Number(req.params.stepNumber));
    const body = req.body ?? {};
    const requestedTool = String(
      body.requestedTool ?? body.recommendedTool ?? body.tool ?? '',
    ).trim();

    const traceId =
      typeof req.headers['x-cardbey-trace-id'] === 'string'
        ? req.headers['x-cardbey-trace-id'].trim()
        : null;

    const result = await executeMissionStep({
      user: req.user,
      missionId,
      stepNumber,
      stepId: typeof body.stepId === 'string' ? body.stepId.trim() : null,
      requestedTool,
      source: typeof body.source === 'string' ? body.source.trim() : 'runtime_step_execute',
      traceId,
      requestId: typeof body.requestId === 'string' ? body.requestId.trim() : null,
      targetContext: body.targetContext ?? null,
      continuationContract: body.continuationContract ?? body._completedContext ?? null,
      body,
      parameters: body.parameters && typeof body.parameters === 'object' ? body.parameters : {},
      proactivePlanTotal: Math.max(0, Math.floor(Number(body.proactivePlanTotal) || 0)),
      forceRetry: body.forceRetry === true || body.regenerate === true,
    });

    return res.status(result.httpStatus ?? (result.ok ? 200 : 500)).json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
