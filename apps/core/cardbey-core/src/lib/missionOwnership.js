/**
 * Reassign mission pipeline / orchestrator / shadow Mission rows after guest store claim or login.
 */

import { getTenantId } from './tenant.js';
import { resetMissionAccessCacheForTests } from './missionAccess.js';

function isGuestActorId(value) {
  return typeof value === 'string' && value.trim().toLowerCase().startsWith('guest_');
}

/**
 * Collect mission pipeline ids linked to a guest temp store (by store id, draft run, orchestrator task).
 * @param {import('./prismaClient.js').PrismaClient} prisma
 * @param {{ storeId: string, draft?: { id?: string, generationRunId?: string | null } | null }} opts
 * @returns {Promise<string[]>}
 */
export async function collectMissionIdsForStoreClaim(prisma, { storeId, draft = null }) {
  const sid = String(storeId ?? '').trim();
  if (!sid) return [];
  const ids = new Set();

  const pipelines = await prisma.missionPipeline.findMany({
    where: { targetType: 'store', targetId: sid },
    select: { id: true },
  });
  for (const p of pipelines) {
    if (p?.id) ids.add(p.id);
  }

  const runId =
    (draft && typeof draft.generationRunId === 'string' && draft.generationRunId.trim()) || null;
  if (runId) {
    const tasks = await prisma.orchestratorTask.findMany({
      where: { missionId: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 80,
      select: { missionId: true, request: true },
    });
    for (const t of tasks) {
      const req = t.request && typeof t.request === 'object' ? t.request : null;
      if (req?.generationRunId === runId && t.missionId) ids.add(String(t.missionId).trim());
    }
  }

  const tasksByStore = await prisma.orchestratorTask.findMany({
    where: { missionId: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: 80,
    select: { missionId: true, request: true, result: true },
  });
  for (const t of tasksByStore) {
    const req = t.request && typeof t.request === 'object' ? t.request : null;
    const res = t.result && typeof t.result === 'object' ? t.result : null;
    const reqStore = req?.storeId ?? req?.targetId;
    const resStore = res?.storeId ?? res?.businessId;
    if ((reqStore === sid || resStore === sid) && t.missionId) {
      ids.add(String(t.missionId).trim());
    }
  }

  return [...ids].filter(Boolean);
}

/**
 * Align pipeline, orchestrator task, and shadow Mission ownership with the authenticated user.
 * @param {import('./prismaClient.js').PrismaClient} prisma
 * @param {string} missionId
 * @param {string} userId
 * @param {{ tenantId?: string | null, user?: { id: string, business?: { id: string } | null } }} [opts]
 */
export async function normalizeMissionOwnershipForUser(prisma, missionId, userId, opts = {}) {
  const mid = String(missionId ?? '').trim();
  const uid = String(userId ?? '').trim();
  if (!mid || !uid) return { updated: false, missionId: mid };

  const tenantId =
    (opts.tenantId != null && String(opts.tenantId).trim()) ||
    (opts.user ? getTenantId(opts.user) : null) ||
    uid;

  const pipe = await prisma.missionPipeline.findUnique({
    where: { id: mid },
    select: { id: true, createdBy: true, tenantId: true },
  });
  if (!pipe) return { updated: false, missionId: mid };

  const shouldReassign =
    isGuestActorId(pipe.createdBy) ||
    isGuestActorId(pipe.tenantId) ||
    (pipe.createdBy && pipe.createdBy !== uid) ||
    (pipe.tenantId && pipe.tenantId !== tenantId && pipe.tenantId !== uid);

  if (shouldReassign) {
    await prisma.missionPipeline.update({
      where: { id: mid },
      data: { createdBy: uid, tenantId },
    });
  }

  await prisma.orchestratorTask.updateMany({
    where: { missionId: mid },
    data: { userId: uid, tenantId },
  });

  const shadow = await prisma.mission.findUnique({
    where: { id: mid },
    select: { id: true, createdByUserId: true },
  });
  if (shadow) {
    const shadowGuest = isGuestActorId(shadow.createdByUserId);
    if (shadowGuest || shadow.createdByUserId !== uid) {
      await prisma.mission.update({
        where: { id: mid },
        data: { createdByUserId: uid, tenantId },
      });
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log('[mission-ownership] normalized', { missionId: mid, userId: uid, tenantId, reassigned: shouldReassign });
  }

  return { updated: shouldReassign, missionId: mid };
}

/** @internal */
export function resetMissionOwnershipForTests() {
  resetMissionAccessCacheForTests();
}
