/**
 * Mission continuation / handoff contract helpers (ENABLE_MISSION_HANDOFF).
 */

import { getPrismaClient } from './prisma.js';
import { isSuccessfulTerminalMissionPipelineStatus } from './missionPipelineTerminalStatus.js';
import { getMissionParentMissionId } from './mission/missionParentLineage.js';

/**
 * @param {unknown} raw
 * @returns {object|null}
 */
export function parseClientContinuationContract(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw;
}

/**
 * Build a recoverable continuation contract from a completed parent mission row.
 * @param {string} missionId
 * @returns {Promise<object|null>}
 */
export async function resolveContinuationContract(missionId) {
  if (process.env.ENABLE_MISSION_HANDOFF !== 'true') return null;
  const id = String(missionId ?? '').trim();
  if (!id) return null;

  const prisma = getPrismaClient();
  const row = await prisma.missionPipeline.findUnique({
    where: { id },
    select: {
      id: true,
      type: true,
      status: true,
      runState: true,
      targetType: true,
      targetId: true,
      metadataJson: true,
    },
  });
  if (!row) return null;

  if (
    !isSuccessfulTerminalMissionPipelineStatus(row.status, {
      runState: row.runState,
    })
  ) {
    return null;
  }

  const meta =
    row.metadataJson && typeof row.metadataJson === 'object' && !Array.isArray(row.metadataJson)
      ? row.metadataJson
      : {};
  const stored = parseClientContinuationContract(meta.continuationContract);
  if (stored) return stored;

  return {
    completedMissionId: row.id,
    parentMissionId: getMissionParentMissionId(row) ?? row.id,
    targetId: row.targetId ?? null,
    targetType: row.targetType ?? null,
    completedMissionType: row.type ?? null,
    continuationMode: 'child',
    source: 'backend_recovery',
  };
}

/**
 * @param {{ childMissionId: string, contract: object }} args
 */
export async function logMissionContinuationSpawned({ childMissionId, contract }) {
  if (process.env.NODE_ENV === 'production') return;
  const c = contract && typeof contract === 'object' ? contract : {};
  console.log('createMissionPipeline with continuation contract', {
    childMissionId,
    completedMissionId: c.completedMissionId ?? c.parentMissionId ?? null,
    parentMissionId: c.parentMissionId ?? null,
    targetId: c.targetId ?? null,
    targetType: c.targetType ?? null,
    continuationMode: c.continuationMode ?? 'child',
    source: c.source ?? 'spawn',
  });
}
