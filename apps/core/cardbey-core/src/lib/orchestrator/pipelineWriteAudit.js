/**
 * Phase 0: optional structured logging for non-runner MissionPipeline writes.
 * Enable with PIPELINE_WRITE_AUDIT=true — does not change update semantics.
 * In-memory buffer for Mission Console telemetry (see missionConsoleTelemetryStore.js).
 */

import { recordPipelineWriteEvent } from './missionConsoleTelemetryStore.js';

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ where: object, data: object, source: string, correlationId?: string|null }} args
 * @returns {Promise<object>}
 */
export async function auditedPipelineUpdate(prisma, { where, data, source, correlationId = null }) {
  const missionId = where && typeof where.id === 'string' ? where.id : where?.id ?? null;
  const fields =
    data && typeof data === 'object' && !Array.isArray(data) ? Object.keys(data) : [];
  recordPipelineWriteEvent({ source, correlationId, missionId, fields });

  if (process.env.PIPELINE_WRITE_AUDIT === 'true') {
    const line = JSON.stringify({
      tag: 'PIPELINE_WRITE',
      source,
      correlationId: correlationId ?? undefined,
      missionId,
      fields,
    });
    console.log(line);
  }
  return prisma.missionPipeline.update({ where, data });
}
