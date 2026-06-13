/**
 * Orchestra start — Performer Runtime adapter (Sprint 1).
 * POST /api/mi/orchestra/start must enter through performerRuntime.execute().
 */

import { performerRuntime } from './performerRuntime.js';
import { recordRuntimeAuthorityPathUsed } from './runtimeAuthorityGuard.js';

/**
 * Route orchestra start through Performer Runtime before internal adapter runs.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {(req: import('express').Request, res: import('express').Response) => Promise<void>} internalHandler
 */
export async function routeOrchestraStartViaPerformerRuntime(req, res, internalHandler) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const userId = req.userId ?? req.user?.id ?? null;
  const goal = typeof body.goal === 'string' ? body.goal.trim() : '';
  const missionId =
    typeof body.missionId === 'string' && body.missionId.trim() ? body.missionId.trim() : null;

  recordRuntimeAuthorityPathUsed({
    route: '/api/mi/orchestra/start',
    toolName: goal || 'orchestra_start',
    userId,
    missionId,
    source: 'orchestra_start',
  });

  const runtimeResult = await performerRuntime.execute({
    actionType: 'orchestra_start',
    userId,
    missionId,
    tenantId: body.tenantId ?? req.user?.tenantId ?? null,
    storeId: body.storeId ?? null,
    source: 'orchestra_start',
    payload: {
      goal,
      entryPoint: body.entryPoint ?? null,
      missionId,
    },
  });

  if (runtimeResult.status === 'blocked') {
    return res.status(403).json({
      ok: false,
      error: runtimeResult.blocker?.code ?? 'RUNTIME_BLOCKED',
      message: runtimeResult.blocker?.message ?? 'Orchestra start blocked by runtime guard',
      missionId,
    });
  }

  if (runtimeResult.status === 'failed') {
    return res.status(500).json({
      ok: false,
      error: runtimeResult.error?.code ?? 'RUNTIME_FAILED',
      message: runtimeResult.error?.message ?? 'Orchestra runtime prelude failed',
      missionId,
    });
  }

  return internalHandler(req, res);
}
