/**
 * Unified execution checkpoint handler — single entry for owner checkpoint respond + resume.
 * HTTP: POST /api/execution/:executionId/checkpoint
 */

import { getPrismaClient } from '../prisma.js';
import { resolveAccessibleMission } from '../missionAccess.js';
import { respondMissionCheckpointAndResume } from './missionCheckpointRespond.js';

/** @deprecated Surfaces that duplicate checkpoint respond; use POST /api/execution/:executionId/checkpoint */
export const DEPRECATED_CHECKPOINT_SURFACES = Object.freeze({
  missionsRespond: {
    method: 'POST',
    path: '/api/missions/:missionId/respond',
    replacement: 'POST /api/execution/:executionId/checkpoint',
  },
});

/**
 * @param {unknown} body
 * @returns {{ stepId: string, response: unknown, data: Record<string, unknown> }}
 */
export function parseExecutionCheckpointBody(body) {
  const stepId = typeof body?.stepId === 'string' ? body.stepId.trim() : '';
  const response = body?.response;
  const data =
    body?.data && typeof body.data === 'object' && !Array.isArray(body.data) ? body.data : {};
  return { stepId, response, data };
}

/**
 * @param {import('express').Response} res
 * @param {'missionsRespond'} [surfaceKey]
 */
export function applyDeprecatedCheckpointHeaders(res, surfaceKey = 'missionsRespond') {
  const surface = DEPRECATED_CHECKPOINT_SURFACES[surfaceKey];
  if (!surface) return;
  res.setHeader('Deprecation', 'true');
  res.setHeader(
    'X-API-Deprecated',
    `${surface.method} ${surface.path}; use ${surface.replacement}`,
  );
}

/**
 * @param {object} checkpointResult
 * @param {string} executionId
 */
export function toExecutionCheckpointHttpResponse(checkpointResult, executionId) {
  if (!checkpointResult?.ok) {
    return {
      statusCode: checkpointResult.statusCode ?? 409,
      body: {
        ok: false,
        error: checkpointResult.error ?? 'checkpoint_respond_failed',
        message: checkpointResult.message ?? 'Could not resume execution from checkpoint',
      },
    };
  }

  const orchestration = checkpointResult.orchestration ?? {};
  return {
    statusCode: 200,
    body: {
      ok: true,
      resumed: true,
      executionId,
      /** @deprecated Use executionId */
      missionId: checkpointResult.missionId ?? executionId,
      stepId: checkpointResult.stepId ?? null,
      orchestration: {
        stepsRun: orchestration.stepsRun,
        stoppedReason: orchestration.stoppedReason,
        status: orchestration.status,
      },
      missionStatus: checkpointResult.missionStatus ?? null,
      executionPath: checkpointResult.executionPath ?? 'kernel_dispatch',
    },
  };
}

/**
 * @param {object} input
 * @param {object} [input.user]
 * @param {string} input.executionId
 * @param {string} input.stepId
 * @param {unknown} input.response
 * @param {Record<string, unknown>} [input.data]
 * @param {string} [input.source]
 * @param {import('../prisma.js').PrismaClient} [input.prisma]
 */
export async function handleExecutionCheckpoint(input = {}) {
  const executionIdTrimmed = String(input.executionId ?? '').trim();
  const stepIdTrimmed = String(input.stepId ?? '').trim();

  if (!executionIdTrimmed || !stepIdTrimmed) {
    return {
      ok: false,
      statusCode: 400,
      error: 'validation',
      message: 'executionId and stepId are required',
    };
  }

  const access = await resolveAccessibleMission(input.user ?? {}, executionIdTrimmed);
  if (!access.ok || access.kind !== 'mission_pipeline') {
    return {
      ok: false,
      statusCode: 403,
      error: 'forbidden',
      message: 'Execution not found or access denied',
    };
  }

  const prisma = input.prisma ?? getPrismaClient();
  const source = String(input.source ?? 'execution_checkpoint').trim();

  return respondMissionCheckpointAndResume(
    prisma,
    executionIdTrimmed,
    stepIdTrimmed,
    input.response,
    input.data ?? {},
    { source },
  );
}
