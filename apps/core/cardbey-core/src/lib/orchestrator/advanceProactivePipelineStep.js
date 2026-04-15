/**
 * Gated MissionPipeline advance for performer proactive-step / proactive-confirm surfaces only.
 *
 * Blocks writes when `MissionPipeline.executionMode` is `AUTO_RUN` (system-driven pipelines must not
 * be mutated by the proactive runway). Allows `GUIDED_RUN` and null/legacy rows (pre–executionMode column).
 */

import { auditedPipelineUpdate } from './pipelineWriteAudit.js';

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ missionId: string, data: object, source: string, correlationId?: string | null, executionMode?: string | null }} args
 *        Pass `executionMode` when already loaded to skip a DB read.
 * @returns {Promise<{ ok: true } | { ok: false, code: 'NOT_FOUND' | 'NOT_GUIDED', message?: string }>}
 */
export async function advanceProactivePipelineStep(prisma, args) {
  const missionId = typeof args.missionId === 'string' ? args.missionId.trim() : '';
  if (!missionId) {
    return { ok: false, code: 'NOT_FOUND', message: 'missionId required' };
  }

  let executionMode = args.executionMode;
  if (executionMode === undefined) {
    const row = await prisma.missionPipeline
      .findUnique({
        where: { id: missionId },
        select: { executionMode: true },
      })
      .catch(() => null);
    if (!row) {
      return { ok: false, code: 'NOT_FOUND', message: 'Mission pipeline not found' };
    }
    executionMode = row.executionMode;
  }

  const em = executionMode == null ? '' : String(executionMode).trim();
  if (em === 'AUTO_RUN') {
    return {
      ok: false,
      code: 'NOT_GUIDED',
      message:
        'MissionPipeline.executionMode is AUTO_RUN; proactive runway cannot advance this pipeline.',
    };
  }

  await auditedPipelineUpdate(prisma, {
    where: { id: missionId },
    data: args.data,
    source: args.source,
    correlationId: args.correlationId ?? missionId,
  });
  return { ok: true };
}
