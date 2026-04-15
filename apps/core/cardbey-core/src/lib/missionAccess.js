/**
 * Unified mission access resolution.
 * Single source of truth for resolving missionId against Mission, OrchestratorTask, MissionPipeline
 * and determining if the current user can access it. Prevents inconsistent 403s across state, events, intents, report.
 *
 * Use in: miIntentsRoutes, missionsRoutes (pipeline routes only).
 * Do NOT use in: agentMessagesRoutes or legacy mission routes that rely on canAccessMission (no-task → allow).
 */

import { getPrismaClient } from '../lib/prisma.js';

const isDev = process.env.NODE_ENV !== 'production';

/** Same as missionsRoutes / miIntentsRoutes: user's tenant for pipeline and mission ownership. */
export function getTenantId(user) {
  return user?.business?.id ?? user?.id ?? null;
}

function isDevPlaceholderId(value) {
  return value === 'temp' || value === 'dev-user-id';
}

/**
 * Resolve missionId against Mission, OrchestratorTask, MissionPipeline (in that order) and check access.
 * Preserves existing allow rules: Mission (createdByUserId, tenantId + dev bypass), OrchestratorTask (userId, tenantId + effectiveTenant + dev bypass), MissionPipeline (tenantId, createdBy).
 *
 * @param {object} user - req.user (must have id, optional business.id)
 * @param {string} missionIdTrimmed - trimmed mission id
 * @returns {Promise<{
 *   ok: true,
 *   kind: 'mission'|'orchestrator_task'|'mission_pipeline',
 *   missionId: string,
 *   record: object,
 *   tenantId: string|null,
 *   createdBy: string|null,
 *   canAccess: true,
 *   displayType?: string
 * }|{
 *   ok: false,
 *   reason: 'NOT_FOUND'
 * }|{
 *   ok: false,
 *   reason: 'FORBIDDEN',
 *   kind: string,
 *   missionId: string
 * }>}
 */
export async function resolveAccessibleMission(user, missionIdTrimmed) {
  if (isDev) {
    console.log('[MissionAccess] resolve missionId=', missionIdTrimmed);
  }
  const prisma = getPrismaClient();

  // 1. Mission
  const mission = await prisma.mission.findUnique({
    where: { id: missionIdTrimmed },
    select: { createdByUserId: true, tenantId: true },
  });
  if (mission) {
    const ownerId = user?.id;
    const businessId = user?.business?.id;
    const isOwner =
      mission.createdByUserId === ownerId ||
      mission.tenantId === ownerId ||
      mission.tenantId === businessId;
    const devPlaceholder =
      mission.createdByUserId === 'temp' ||
      mission.tenantId === 'temp' ||
      mission.createdByUserId === 'dev-user-id' ||
      mission.tenantId === 'dev-user-id';
    const devBypass = isDev && ownerId && devPlaceholder;
    if (isOwner || devBypass) {
      // Prefer MissionPipeline when the same id exists (pipeline endpoints require kind=mission_pipeline).
      const pipeline = await prisma.missionPipeline.findUnique({
        where: { id: missionIdTrimmed },
        select: { tenantId: true, createdBy: true },
      });
      if (pipeline) {
        const tenantId = getTenantId(user);
        const allowed =
          !pipeline.tenantId ||
          pipeline.tenantId === tenantId ||
          (pipeline.createdBy && user?.id && pipeline.createdBy === user.id);
        const pipelineDevPlaceholder = isDevPlaceholderId(pipeline.tenantId) || isDevPlaceholderId(pipeline.createdBy);
        const pipelineDevBypass = isDev && user?.id && pipelineDevPlaceholder;
        if (allowed || pipelineDevBypass) {
          if (isDev) console.log('[MissionAccess] resolved kind=mission_pipeline missionId=', missionIdTrimmed);
          return {
            ok: true,
            kind: 'mission_pipeline',
            missionId: missionIdTrimmed,
            record: pipeline,
            tenantId: pipeline.tenantId ?? null,
            createdBy: pipeline.createdBy ?? null,
            canAccess: true,
            displayType: 'Pipeline Mission',
          };
        }
      }
      if (isDev) console.log('[MissionAccess] resolved kind=mission missionId=', missionIdTrimmed);
      return {
        ok: true,
        kind: 'mission',
        missionId: missionIdTrimmed,
        record: mission,
        tenantId: mission.tenantId ?? null,
        createdBy: mission.createdByUserId ?? null,
        canAccess: true,
        displayType: 'Mission',
      };
    }
    // Shadow Mission rows (e.g. temp tenant from ensureMissionRowForBlackboard) can exist while the
    // real access contract is MissionPipeline.createdBy — allow pipeline ownership before 403.
    const pipelineOwned = await prisma.missionPipeline.findUnique({
      where: { id: missionIdTrimmed },
      select: { tenantId: true, createdBy: true },
    });
    if (pipelineOwned) {
      const tenantId = getTenantId(user);
      const allowed =
        !pipelineOwned.tenantId ||
        pipelineOwned.tenantId === tenantId ||
        (pipelineOwned.createdBy && user?.id && pipelineOwned.createdBy === user.id);
      const pipelineDevPlaceholder =
        isDevPlaceholderId(pipelineOwned.tenantId) || isDevPlaceholderId(pipelineOwned.createdBy);
      const pipelineDevBypass = isDev && user?.id && pipelineDevPlaceholder;
      if (allowed || pipelineDevBypass) {
        if (isDev) {
          console.log('[MissionAccess] resolved kind=mission_pipeline (mission row not owner) missionId=', missionIdTrimmed);
        }
        return {
          ok: true,
          kind: 'mission_pipeline',
          missionId: missionIdTrimmed,
          record: pipelineOwned,
          tenantId: pipelineOwned.tenantId ?? null,
          createdBy: pipelineOwned.createdBy ?? null,
          canAccess: true,
          displayType: 'Pipeline Mission',
        };
      }
    }
    if (isDev) console.log('[MissionAccess] forbidden kind=mission missionId=', missionIdTrimmed);
    return { ok: false, reason: 'FORBIDDEN', kind: 'mission', missionId: missionIdTrimmed };
  }

  // 2. OrchestratorTask
  const task = await prisma.orchestratorTask.findUnique({
    where: { id: missionIdTrimmed },
    select: { userId: true, tenantId: true },
  });
  if (task) {
    const ownerId = user?.id;
    const businessId = user?.business?.id;
    const effectiveTenant = businessId ?? ownerId;
    const isOwner =
      task.userId === ownerId ||
      task.userId === effectiveTenant ||
      task.tenantId === ownerId ||
      task.tenantId === businessId;
    const devPlaceholder =
      task.userId === 'temp' ||
      task.tenantId === 'temp' ||
      task.userId === 'dev-user-id' ||
      task.tenantId === 'dev-user-id';
    const devBypass = isDev && ownerId && devPlaceholder;
    if (isOwner || devBypass) {
      if (isDev) console.log('[MissionAccess] resolved kind=orchestrator_task missionId=', missionIdTrimmed);
      return {
        ok: true,
        kind: 'orchestrator_task',
        missionId: missionIdTrimmed,
        record: task,
        tenantId: task.tenantId ?? null,
        createdBy: task.userId ?? null,
        canAccess: true,
        displayType: 'Task',
      };
    }
    if (isDev) console.log('[MissionAccess] forbidden kind=orchestrator_task missionId=', missionIdTrimmed);
    return { ok: false, reason: 'FORBIDDEN', kind: 'orchestrator_task', missionId: missionIdTrimmed };
  }

  // 2b. OrchestratorTask linked by missionId (store / website build: task.missionId === MissionPipeline.id)
  if (user?.id) {
    const taskForPipeline = await prisma.orchestratorTask.findFirst({
      where: { missionId: missionIdTrimmed, userId: user.id },
      select: { id: true, userId: true, tenantId: true },
    });
    if (taskForPipeline) {
      if (isDev) {
        console.log('[MissionAccess] resolved kind=orchestrator_task (by missionId) missionId=', missionIdTrimmed);
      }
      return {
        ok: true,
        kind: 'orchestrator_task',
        missionId: missionIdTrimmed,
        record: taskForPipeline,
        tenantId: taskForPipeline.tenantId ?? null,
        createdBy: taskForPipeline.userId ?? null,
        canAccess: true,
        displayType: 'Task',
      };
    }
  }

  // 3. MissionPipeline
  const pipeline = await prisma.missionPipeline.findUnique({
    where: { id: missionIdTrimmed },
    select: { tenantId: true, createdBy: true },
  });
  if (pipeline) {
    const tenantId = getTenantId(user);
    const allowed =
      !pipeline.tenantId ||
      pipeline.tenantId === tenantId ||
      (pipeline.createdBy && user?.id && pipeline.createdBy === user.id);
    const devPlaceholder = isDevPlaceholderId(pipeline.tenantId) || isDevPlaceholderId(pipeline.createdBy);
    const devBypass = isDev && user?.id && devPlaceholder;
    if (allowed || devBypass) {
      if (isDev) console.log('[MissionAccess] resolved kind=mission_pipeline missionId=', missionIdTrimmed);
      return {
        ok: true,
        kind: 'mission_pipeline',
        missionId: missionIdTrimmed,
        record: pipeline,
        tenantId: pipeline.tenantId ?? null,
        createdBy: pipeline.createdBy ?? null,
        canAccess: true,
        displayType: 'Pipeline Mission',
      };
    }
    if (isDev) console.log('[MissionAccess] forbidden kind=mission_pipeline missionId=', missionIdTrimmed);
    return { ok: false, reason: 'FORBIDDEN', kind: 'mission_pipeline', missionId: missionIdTrimmed };
  }

  if (isDev) console.log('[MissionAccess] not found missionId=', missionIdTrimmed);
  return { ok: false, reason: 'NOT_FOUND' };
}
