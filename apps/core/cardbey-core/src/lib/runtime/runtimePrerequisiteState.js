/**
 * Persist / read runtime prerequisite state on MissionPipeline.metadataJson.runtimePrerequisites.
 */

import { auditedPipelineUpdate } from '../orchestrator/pipelineWriteAudit.js';

export const RUNTIME_PREREQ_STATUS = {
  WAITING: 'waiting_for_prerequisite',
  RESOLVED: 'prerequisite_resolved',
  RESUMED: 'resumed_after_prerequisite',
};

function asObj(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * @param {unknown} metadataJson
 */
export function readRuntimePrerequisites(metadataJson) {
  const meta = asObj(metadataJson);
  const rp = asObj(meta.runtimePrerequisites);
  if (!Object.keys(rp).length) return null;
  return rp;
}

/**
 * @param {unknown} metadataJson
 */
export function isWaitingForPrerequisite(metadataJson) {
  const rp = readRuntimePrerequisites(metadataJson);
  return str(rp?.status) === RUNTIME_PREREQ_STATUS.WAITING;
}

/**
 * @param {import('../prisma.js').PrismaClient} prisma
 * @param {string} missionId
 * @param {object} blockPayload
 */
export async function persistPrerequisiteBlock(prisma, missionId, blockPayload) {
  const mid = str(missionId);
  if (!mid) throw new Error('missionId required');

  const row = await prisma.missionPipeline.findUnique({
    where: { id: mid },
    select: { metadataJson: true },
  });
  const meta = asObj(row?.metadataJson);
  const next = {
    ...meta,
    runtimePrerequisites: {
      ...blockPayload,
      status: RUNTIME_PREREQ_STATUS.WAITING,
      updatedAt: new Date().toISOString(),
    },
  };

  await auditedPipelineUpdate(prisma, {
    where: { id: mid },
    data: { metadataJson: next },
    source: 'runtime.prerequisite.block',
    correlationId: mid,
  });

  return next.runtimePrerequisites;
}

/**
 * @param {import('../prisma.js').PrismaClient} prisma
 * @param {string} missionId
 * @param {object} patch
 */
export async function patchRuntimePrerequisites(prisma, missionId, patch) {
  const mid = str(missionId);
  if (!mid) throw new Error('missionId required');

  const row = await prisma.missionPipeline.findUnique({
    where: { id: mid },
    select: { metadataJson: true },
  });
  const meta = asObj(row?.metadataJson);
  const prev = asObj(meta.runtimePrerequisites);
  const next = {
    ...meta,
    runtimePrerequisites: {
      ...prev,
      ...patch,
      updatedAt: new Date().toISOString(),
    },
  };

  await auditedPipelineUpdate(prisma, {
    where: { id: mid },
    data: { metadataJson: next },
    source: 'runtime.prerequisite.patch',
    correlationId: mid,
  });

  return next.runtimePrerequisites;
}

/**
 * Apply resolved store to mission target + metadata.
 * @param {import('../prisma.js').PrismaClient} prisma
 * @param {string} missionId
 * @param {string} storeId
 */
export async function bindStoreToMission(prisma, missionId, storeId) {
  const mid = str(missionId);
  const sid = str(storeId);
  if (!mid || !sid) return null;

  const row = await prisma.missionPipeline.findUnique({
    where: { id: mid },
    select: { metadataJson: true, targetType: true },
  });
  const meta = asObj(row?.metadataJson);
  const nextMeta = { ...meta, storeId: sid };

  await auditedPipelineUpdate(prisma, {
    where: { id: mid },
    data: {
      targetId: sid,
      targetType: str(row?.targetType) || 'store',
      metadataJson: nextMeta,
    },
    source: 'runtime.prerequisite.bind_store',
    correlationId: mid,
  });

  return { storeId: sid, missionId: mid };
}
