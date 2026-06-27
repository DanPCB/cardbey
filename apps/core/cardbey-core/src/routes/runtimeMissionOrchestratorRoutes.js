/**
 * Runtime Mission Orchestrator routes.
 * POST /api/runtime/missions/:missionId/run-next
 * POST /api/runtime/missions/:missionId/run-all
 * POST /api/runtime/missions/:missionId/run-until-blocked
 */

import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  runNextStep,
  runAllAvailableSteps,
  runMissionUntilNextBlock,
} from '../lib/runtime/runtimeMissionOrchestrator.js';

const router = express.Router();

function orchestratorContext(req) {
  const body = req.body ?? {};
  const traceId =
    typeof req.headers['x-cardbey-trace-id'] === 'string'
      ? req.headers['x-cardbey-trace-id'].trim()
      : null;
  return {
    user: req.user,
    missionId: String(req.params.missionId ?? '').trim(),
    source: typeof body.source === 'string' ? body.source.trim() : 'runtime_orchestrator_route',
    traceId,
    requestId: typeof body.requestId === 'string' ? body.requestId.trim() : null,
    planSteps: Array.isArray(body.plan) ? body.plan : Array.isArray(body.planSteps) ? body.planSteps : null,
    planParameters:
      body.planParameters && typeof body.planParameters === 'object' && !Array.isArray(body.planParameters)
        ? body.planParameters
        : null,
    stepNumber: body.stepNumber != null ? Math.floor(Number(body.stepNumber)) : null,
    forceRetry: body.forceRetry === true || body.retry === true,
  };
}

function respondOrchestrator(res, result) {
  return res.status(result.httpStatus ?? (result.ok ? 200 : 500)).json(result);
}

router.post('/:missionId/run-next', requireAuth, async (req, res, next) => {
  try {
    const result = await runNextStep(orchestratorContext(req));
    return respondOrchestrator(res, result);
  } catch (err) {
    next(err);
  }
});

router.post('/:missionId/run-all', requireAuth, async (req, res, next) => {
  try {
    const result = await runAllAvailableSteps(orchestratorContext(req));
    return respondOrchestrator(res, result);
  } catch (err) {
    next(err);
  }
});

router.post('/:missionId/run-until-blocked', requireAuth, async (req, res, next) => {
  try {
    const result = await runMissionUntilNextBlock(orchestratorContext(req));
    return respondOrchestrator(res, result);
  } catch (err) {
    next(err);
  }
});

export default router;
