/**
 * Canonical mission authority — single persisted record for topology execution.
 */

import { getPrismaClient } from '../prisma.js';

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

/**
 * @typedef {{
 *   missionId: string;
 *   persistenceKind: 'mission_pipeline' | 'mi_mission' | 'orchestrator_task' | 'blackboard_only' | 'unknown';
 *   persistenceRecordId: string;
 *   repository: string;
 *   createdAt?: string | null;
 *   currentState?: string | null;
 *   record?: Record<string, unknown> | null;
 * }} MissionAuthorityRecord
 */

/**
 * Resolve the authoritative persisted mission record for topology execution.
 * Topology writes require persistenceKind === 'mission_pipeline'.
 *
 * @param {string} missionId
 * @returns {Promise<{ ok: true, authority: MissionAuthorityRecord } | { ok: false, code: string, message: string, missionId: string }>}
 */
export async function resolveMissionAuthority(missionId) {
  const mid = pickString(missionId);
  if (!mid) {
    return {
      ok: false,
      code: 'MISSION_RECORD_NOT_FOUND',
      message: 'missionId is required',
      missionId: '',
    };
  }

  const prisma = getPrismaClient();

  const pipeline = await prisma.missionPipeline.findUnique({
    where: { id: mid },
    select: {
      id: true,
      status: true,
      type: true,
      createdAt: true,
      metadataJson: true,
      targetId: true,
      targetType: true,
    },
  });

  if (pipeline) {
    return {
      ok: true,
      authority: {
        missionId: mid,
        persistenceKind: 'mission_pipeline',
        persistenceRecordId: pipeline.id,
        repository: 'MissionPipeline',
        createdAt: pipeline.createdAt?.toISOString?.() ?? null,
        currentState: String(pipeline.status ?? '').trim() || null,
        record: pipeline,
      },
    };
  }

  const legacyMission = await prisma.mission.findUnique({
    where: { id: mid },
    select: { id: true, status: true, createdAt: true },
  });
  if (legacyMission) {
    return {
      ok: true,
      authority: {
        missionId: mid,
        persistenceKind: 'mi_mission',
        persistenceRecordId: legacyMission.id,
        repository: 'Mission',
        createdAt: legacyMission.createdAt?.toISOString?.() ?? null,
        currentState: String(legacyMission.status ?? '').trim() || null,
        record: legacyMission,
      },
    };
  }

  const task = await prisma.orchestratorTask.findFirst({
    where: { OR: [{ id: mid }, { missionId: mid }] },
    select: { id: true, status: true, missionId: true, createdAt: true },
  });
  if (task) {
    return {
      ok: true,
      authority: {
        missionId: mid,
        persistenceKind: 'orchestrator_task',
        persistenceRecordId: task.id,
        repository: 'OrchestratorTask',
        createdAt: task.createdAt?.toISOString?.() ?? null,
        currentState: String(task.status ?? '').trim() || null,
        record: task,
      },
    };
  }

  return {
    ok: false,
    code: 'MISSION_RECORD_NOT_FOUND',
    message:
      'The mission exists in the UI projection but its authoritative execution record is missing.',
    missionId: mid,
  };
}

/**
 * Hard precondition for topology execution writes.
 *
 * @param {string} missionId
 */
export async function requireMissionPipelineAuthority(missionId) {
  const resolved = await resolveMissionAuthority(missionId);
  if (!resolved.ok) {
    return resolved;
  }
  if (resolved.authority.persistenceKind !== 'mission_pipeline') {
    return {
      ok: false,
      code: 'MISSION_AUTHORITY_MISMATCH',
      message: `Topology execution requires MissionPipeline authority (found ${resolved.authority.persistenceKind}).`,
      missionId,
      authority: resolved.authority,
    };
  }
  return resolved;
}

export default { resolveMissionAuthority, requireMissionPipelineAuthority };
