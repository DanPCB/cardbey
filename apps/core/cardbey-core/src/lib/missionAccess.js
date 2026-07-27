/**
 * Unified mission access resolution.
 * Single source of truth for resolving missionId against Mission, OrchestratorTask, MissionPipeline
 * and determining if the current user can access it. Prevents inconsistent 403s across state, events, intents, report.
 *
 * Use in: miIntentsRoutes, missionsRoutes (pipeline routes only).
 * Do NOT use in: agentMessagesRoutes or legacy mission routes that rely on canAccessMission (no-task → allow).
 */

import { getPrismaClient } from '../lib/prisma.js';
import { isPerformerOrchestrationStabilityEnabled } from './broker/brokerFlags.js';
import { canAccessBusiness } from './tenant.js';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Phase 2.3-B — short-window coalescing for mission access resolution.
 *
 * After create_store the dashboard fires a burst of reads (/state, /mission, /executions,
 * /blackboard, /reasoning-log, /events) that each re-resolve access via 2–4 sequential DB
 * queries. We (a) dedupe concurrent in-flight resolves and (b) cache the result for a short
 * window, both keyed by user + mission. Gated behind PERFORMER_ORCHESTRATION_STABILITY so the
 * default behavior is unchanged. Access decisions do not change within the tiny TTL window.
 */
const RESOLVE_CACHE_TTL_MS = (() => {
  const raw = process.env.PERFORMER_MISSION_ACCESS_COALESCE_MS;
  const n = raw == null || String(raw).trim() === '' ? NaN : parseInt(String(raw).trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : 1500;
})();
const RESOLVE_CACHE_MAX = 1000;

/** @type {Map<string, { at: number, value: object }>} */
const resolveCache = new Map();
/** @type {Map<string, Promise<object>>} */
const resolveInflight = new Map();

function resolveCacheKey(user, missionId) {
  return `${user?.id ?? 'anon'}::${user?.business?.id ?? ''}::${missionId}`;
}

function pruneResolveCache(now) {
  if (resolveCache.size <= RESOLVE_CACHE_MAX) return;
  for (const [k, v] of resolveCache) {
    if (now - v.at >= RESOLVE_CACHE_TTL_MS) resolveCache.delete(k);
  }
}

/** Test helper: clear coalescing state. */
export function resetMissionAccessCacheForTests() {
  resolveCache.clear();
  resolveInflight.clear();
}

/** Same as missionsRoutes / miIntentsRoutes: user's tenant for pipeline and mission ownership. */
export function getTenantId(user) {
  return user?.business?.id ?? user?.id ?? null;
}

function isDevPlaceholderId(value) {
  return value === 'temp' || value === 'dev-user-id';
}

function isGuestActorId(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized.startsWith('guest_') || normalized.startsWith('anon_');
}

/** Pipeline tenant/createdBy match, guest-session handoff, or dev placeholder bypass. */
function pipelineOwnedByUser(pipelineRow, user) {
  if (!pipelineRow || !user?.id) return false;
  const tenantId = getTenantId(user);
  if (!pipelineRow.tenantId || pipelineRow.tenantId === tenantId) return true;
  if (pipelineRow.createdBy && pipelineRow.createdBy === user.id) return true;
  if (isGuestActorId(pipelineRow.createdBy) || isGuestActorId(pipelineRow.tenantId)) return true;
  const devPlaceholder = isDevPlaceholderId(pipelineRow.tenantId) || isDevPlaceholderId(pipelineRow.createdBy);
  return isDev && devPlaceholder;
}

function missionRowOwnedByUser(mission, user) {
  if (!mission || !user?.id) return false;
  const ownerId = user.id;
  const businessId = user.business?.id;
  if (
    mission.createdByUserId === ownerId ||
    mission.tenantId === ownerId ||
    mission.tenantId === businessId
  ) {
    return true;
  }
  if (isGuestActorId(mission.createdByUserId) || isGuestActorId(mission.tenantId)) return true;
  const devPlaceholder =
    mission.createdByUserId === 'temp' ||
    mission.tenantId === 'temp' ||
    mission.createdByUserId === 'dev-user-id' ||
    mission.tenantId === 'dev-user-id';
  return isDev && devPlaceholder;
}

function orchestratorTaskOwnedByUser(task, user) {
  if (!task || !user?.id) return false;
  const ownerId = user.id;
  const businessId = user.business?.id;
  const effectiveTenant = businessId ?? ownerId;
  if (
    task.userId === ownerId ||
    task.userId === effectiveTenant ||
    task.tenantId === ownerId ||
    task.tenantId === businessId
  ) {
    return true;
  }
  if (isGuestActorId(task.userId)) return true;
  const devPlaceholder =
    task.userId === 'temp' ||
    task.tenantId === 'temp' ||
    task.userId === 'dev-user-id' ||
    task.tenantId === 'dev-user-id';
  return isDev && devPlaceholder;
}

/**
 * Store-linked pipeline: user owns Business for targetId or draft tied to outputsJson.draftId.
 * @param {import('./prismaClient.js').PrismaClient} prisma
 * @param {string} missionIdTrimmed
 * @param {object} user
 */
async function pipelineStoreOrDraftOwnedByUser(prisma, missionIdTrimmed, user) {
  if (!user?.id) return false;
  const pipe = await prisma.missionPipeline.findUnique({
    where: { id: missionIdTrimmed },
    select: { targetType: true, targetId: true, outputsJson: true },
  });
  if (!pipe) return false;

  const tenantKey = getTenantId(user);
  if (pipe.targetType === 'store' && pipe.targetId) {
    const storeId = String(pipe.targetId).trim();
    if (storeId && (await canAccessBusiness(prisma, { tenantKey, user, storeId }))) {
      return true;
    }
  }

  const outputs =
    pipe.outputsJson && typeof pipe.outputsJson === 'object' && !Array.isArray(pipe.outputsJson)
      ? pipe.outputsJson
      : {};
  const draftId = typeof outputs.draftId === 'string' ? outputs.draftId.trim() : '';
  if (draftId) {
    const draft = await prisma.draftStore.findUnique({
      where: { id: draftId },
      select: { ownerUserId: true, committedStoreId: true },
    });
    if (draft?.ownerUserId === user.id) return true;
    if (draft?.committedStoreId && tenantKey) {
      return canAccessBusiness(prisma, { tenantKey, user, storeId: draft.committedStoreId });
    }
  }

  return false;
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
  // Default (flag OFF): no coalescing — identical to legacy behavior.
  if (!isPerformerOrchestrationStabilityEnabled() || RESOLVE_CACHE_TTL_MS === 0) {
    return resolveAccessibleMissionUncached(user, missionIdTrimmed);
  }

  const key = resolveCacheKey(user, missionIdTrimmed);
  const now = Date.now();

  const cached = resolveCache.get(key);
  if (cached && now - cached.at < RESOLVE_CACHE_TTL_MS) {
    return cached.value;
  }

  const inflight = resolveInflight.get(key);
  if (inflight) return inflight;

  const p = resolveAccessibleMissionUncached(user, missionIdTrimmed)
    .then((value) => {
      resolveCache.set(key, { at: Date.now(), value });
      pruneResolveCache(Date.now());
      return value;
    })
    .finally(() => {
      resolveInflight.delete(key);
    });
  resolveInflight.set(key, p);
  return p;
}

async function resolveAccessibleMissionUncached(user, missionIdTrimmed) {
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
    if (missionRowOwnedByUser(mission, user)) {
      // Prefer MissionPipeline when the same id exists (pipeline endpoints require kind=mission_pipeline).
      const pipeline = await prisma.missionPipeline.findUnique({
        where: { id: missionIdTrimmed },
        select: { tenantId: true, createdBy: true },
      });
      if (pipeline) {
        if (pipelineOwnedByUser(pipeline, user)) {
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
      if (pipelineOwnedByUser(pipelineOwned, user)) {
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
    if (await pipelineStoreOrDraftOwnedByUser(prisma, missionIdTrimmed, user)) {
      const pipelineOwned = await prisma.missionPipeline.findUnique({
        where: { id: missionIdTrimmed },
        select: { tenantId: true, createdBy: true },
      });
      if (pipelineOwned) {
        if (isDev) {
          console.log('[MissionAccess] resolved kind=mission_pipeline (store/draft owner) missionId=', missionIdTrimmed);
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
    if (orchestratorTaskOwnedByUser(task, user)) {
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

  // 3. MissionPipeline — before OrchestratorTask-by-missionId (2b) so pipeline URLs resolve as mission_pipeline
  // for GET /state / blackboard (same id is also linked from OrchestratorTask.missionId).
  const pipelineRow = await prisma.missionPipeline.findUnique({
    where: { id: missionIdTrimmed },
    select: { tenantId: true, createdBy: true },
  });
  if (pipelineRow) {
    if (pipelineOwnedByUser(pipelineRow, user)) {
      if (isDev) console.log('[MissionAccess] resolved kind=mission_pipeline missionId=', missionIdTrimmed);
      return {
        ok: true,
        kind: 'mission_pipeline',
        missionId: missionIdTrimmed,
        record: pipelineRow,
        tenantId: pipelineRow.tenantId ?? null,
        createdBy: pipelineRow.createdBy ?? null,
        canAccess: true,
        displayType: 'Pipeline Mission',
      };
    }
    if (isDev) console.log('[MissionAccess] pipeline row present but denied; trying orchestrator link missionId=', missionIdTrimmed);
  }

  // 2b. OrchestratorTask linked by missionId (store / website build: task.missionId === MissionPipeline.id)
  if (user?.id) {
    let taskForPipeline = await prisma.orchestratorTask.findFirst({
      where: { missionId: missionIdTrimmed, userId: user.id },
      select: { id: true, userId: true, tenantId: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!taskForPipeline) {
      const guestLinked = await prisma.orchestratorTask.findMany({
        where: { missionId: missionIdTrimmed },
        select: { id: true, userId: true, tenantId: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
      taskForPipeline = guestLinked.find((t) => isGuestActorId(t.userId)) ?? null;
    }
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

  if (pipelineRow) {
    if (await pipelineStoreOrDraftOwnedByUser(prisma, missionIdTrimmed, user)) {
      if (isDev) {
        console.log('[MissionAccess] resolved kind=mission_pipeline (store/draft owner) missionId=', missionIdTrimmed);
      }
      return {
        ok: true,
        kind: 'mission_pipeline',
        missionId: missionIdTrimmed,
        record: pipelineRow,
        tenantId: pipelineRow.tenantId ?? null,
        createdBy: pipelineRow.createdBy ?? null,
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
