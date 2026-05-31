/**
 * Runtime Prerequisite Resolution — persist, resolve, and resume blocked missions.
 */

import { getPrismaClient } from '../prisma.js';
import { getTenantId } from '../missionAccess.js';
import { appendEvent } from '../missionBlackboard.js';
import {
  isSuccessfulTerminalMissionPipelineStatus,
} from '../missionPipelineTerminalStatus.js';
import {
  bindStoreToMission,
  patchRuntimePrerequisites,
  persistPrerequisiteBlock,
  readRuntimePrerequisites,
  RUNTIME_PREREQ_STATUS,
} from './runtimePrerequisiteState.js';

function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function asObj(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

async function assertMissionAccess(user, missionId) {
  const prisma = getPrismaClient();
  const mid = str(missionId);
  if (!mid || !user?.id) return { ok: false, reason: 'FORBIDDEN' };

  const tenantId = getTenantId(user);
  const row = await prisma.missionPipeline.findUnique({
    where: { id: mid },
    select: {
      id: true,
      type: true,
      title: true,
      status: true,
      runState: true,
      targetId: true,
      targetType: true,
      parentMissionId: true,
      metadataJson: true,
      createdBy: true,
      tenantId: true,
    },
  });

  if (!row) return { ok: false, reason: 'NOT_FOUND' };
  const uid = str(user.id);
  const allowed =
    str(row.createdBy) === uid ||
    str(row.tenantId) === uid ||
    (tenantId && str(row.tenantId) === str(tenantId));
  if (!allowed) return { ok: false, reason: 'FORBIDDEN' };

  return { ok: true, mission: row };
}

/**
 * Resolve a blocked prerequisite (select store or spawn create-store child mission).
 * @param {{
 *   user: object;
 *   missionId: string;
 *   action: 'select_existing_store' | 'create_store' | 'sync_child_complete';
 *   storeId?: string|null;
 *   autoResume?: boolean;
 *   traceId?: string|null;
 * }} input
 */
export async function resolvePrerequisiteAction(input) {
  const req = input && typeof input === 'object' ? input : {};
  const missionId = str(req.missionId);
  const action = str(req.action);
  const autoResume = req.autoResume !== false;

  const access = await assertMissionAccess(req.user, missionId);
  if (!access.ok) {
    return {
      ok: false,
      httpStatus: access.reason === 'NOT_FOUND' ? 404 : 403,
      code: access.reason ?? 'FORBIDDEN',
      message: 'Mission not found or access denied',
    };
  }

  const mission = access.mission;
  const meta = asObj(mission.metadataJson);
  const blocked = readRuntimePrerequisites(meta);

  if (action === 'sync_child_complete') {
    const childMissionId = str(req.childMissionId);
    return tryResumeAfterPrerequisiteChildCompleted(childMissionId || missionId, {
      user: req.user,
      autoResume: req.autoResume !== false,
      traceId: req.traceId ?? null,
    });
  }

  if (!blocked || str(blocked.status) !== RUNTIME_PREREQ_STATUS.WAITING) {
    return {
      ok: false,
      httpStatus: 409,
      code: 'NO_BLOCKED_PREREQUISITE',
      message: 'Mission is not waiting for prerequisite resolution',
    };
  }

  const resumableIntent = asObj(blocked.resumableIntent);
  const prisma = getPrismaClient();

  if (action === 'select_existing_store') {
    const storeId = str(req.storeId);
    if (!storeId) {
      return {
        ok: false,
        httpStatus: 400,
        code: 'STORE_ID_REQUIRED',
        message: 'storeId is required for select_existing_store',
      };
    }

    const business = await prisma.business.findFirst({
      where: { id: storeId, userId: req.user.id, isActive: true },
      select: { id: true, name: true },
    });
    if (!business) {
      return {
        ok: false,
        httpStatus: 404,
        code: 'STORE_NOT_FOUND',
        message: 'Store not found or access denied',
      };
    }

    await bindStoreToMission(prisma, missionId, storeId);
    await patchRuntimePrerequisites(prisma, missionId, {
      status: RUNTIME_PREREQ_STATUS.RESOLVED,
      resolvedAction: action,
      resolvedStoreId: storeId,
      resolvedAt: new Date().toISOString(),
    });

    try {
      await appendEvent(missionId, 'runtime.prerequisite.resolved', {
        action,
        storeId,
        resumableIntent,
      });
    } catch {
      /* best-effort */
    }

    let resumeResult = null;
    if (autoResume && resumableIntent.originalTool && resumableIntent.stepNumber >= 1) {
      await patchRuntimePrerequisites(prisma, missionId, {
        status: RUNTIME_PREREQ_STATUS.RESUMED,
        resumedAt: new Date().toISOString(),
      });
      const { executeMissionStep } = await import('./performerRuntimeKernel.js');
      resumeResult = await executeMissionStep({
        user: req.user,
        missionId,
        stepNumber: resumableIntent.stepNumber,
        requestedTool: resumableIntent.originalTool,
        parameters: { ...asObj(resumableIntent.parameters), storeId },
        targetContext: { storeId },
        continuationContract: resumableIntent.continuationContract ?? null,
        source: 'runtime_prerequisite_resume',
        traceId: req.traceId ?? null,
        forceRetry: false,
      });
    }

    return {
      ok: true,
      httpStatus: 200,
      code: 'PREREQUISITE_RESOLVED',
      action,
      storeId,
      resumableIntent,
      resumeResult,
    };
  }

  if (action === 'create_store') {
    const { createMissionPipeline } = await import('../missionPipelineService.js');
    const tenantId = getTenantId(req.user);
    const childTitle =
      str(req.storeTitle) ||
      `Create store (prerequisite for ${str(mission.title) || 'mission'})`;

    const child = await createMissionPipeline({
      type: 'store',
      title: childTitle,
      targetType: 'store',
      parentMissionId: missionId,
      metadata: {
        runtimePrerequisiteChild: true,
        blockedParentMissionId: missionId,
        resumableIntent,
        source: 'runtime_prerequisite',
      },
      createdBy: req.user.id,
      tenantId,
      executionMode: 'GUIDED_RUN',
    });

    await patchRuntimePrerequisites(prisma, missionId, {
      prerequisiteChildMissionId: child.id,
      resolvedAction: action,
      childMissionTitle: childTitle,
    });

    try {
      await appendEvent(missionId, 'runtime.prerequisite.child_spawned', {
        childMissionId: child.id,
        parentMissionId: missionId,
        resumableIntent,
      });
      await appendEvent(child.id, 'runtime.prerequisite.child_started', {
        parentMissionId: missionId,
        resumableIntent,
      });
    } catch {
      /* best-effort */
    }

    return {
      ok: true,
      httpStatus: 200,
      code: 'PREREQUISITE_CHILD_SPAWNED',
      action,
      childMissionId: child.id,
      parentMissionId: missionId,
      resumableIntent,
    };
  }

  return {
    ok: false,
    httpStatus: 400,
    code: 'INVALID_ACTION',
    message: `Unknown prerequisite action: ${action}`,
  };
}

/**
 * When a prerequisite child store mission completes, bind store to parent and resume blocked step.
 * @param {string} childMissionId
 * @param {{ user?: object|null; autoResume?: boolean; traceId?: string|null }} [opts]
 */
export async function tryResumeAfterPrerequisiteChildCompleted(childMissionId, opts = {}) {
  const cid = str(childMissionId);
  if (!cid) {
    return { ok: false, httpStatus: 400, code: 'INVALID_REQUEST', message: 'childMissionId required' };
  }

  const prisma = getPrismaClient();
  const child = await prisma.missionPipeline.findUnique({
    where: { id: cid },
    select: {
      id: true,
      type: true,
      status: true,
      runState: true,
      targetId: true,
      parentMissionId: true,
      metadataJson: true,
      outputsJson: true,
      createdBy: true,
    },
  });

  if (!child) {
    return { ok: false, httpStatus: 404, code: 'NOT_FOUND', message: 'Child mission not found' };
  }

  const childMeta = asObj(child.metadataJson);
  if (!childMeta.runtimePrerequisiteChild) {
    return {
      ok: false,
      httpStatus: 409,
      code: 'NOT_PREREQUISITE_CHILD',
      message: 'Mission is not a runtime prerequisite child',
    };
  }

  if (
    !isSuccessfulTerminalMissionPipelineStatus(child.status, { runState: child.runState })
  ) {
    return {
      ok: false,
      httpStatus: 409,
      code: 'CHILD_NOT_COMPLETE',
      message: 'Prerequisite child mission is not complete yet',
    };
  }

  const parentMissionId = str(child.parentMissionId) || str(childMeta.blockedParentMissionId);
  if (!parentMissionId) {
    return { ok: false, httpStatus: 409, code: 'NO_PARENT', message: 'Parent mission not linked' };
  }

  const storeId =
    str(child.targetId) ||
    str(asObj(childMeta).storeId) ||
    str(asObj(child.outputsJson).storeId);

  if (!storeId) {
    return {
      ok: false,
      httpStatus: 409,
      code: 'NO_STORE_FROM_CHILD',
      message: 'Completed child mission has no store target',
    };
  }

  const parent = await prisma.missionPipeline.findUnique({
    where: { id: parentMissionId },
    select: { metadataJson: true, createdBy: true, tenantId: true },
  });
  if (!parent) {
    return { ok: false, httpStatus: 404, code: 'PARENT_NOT_FOUND', message: 'Parent mission not found' };
  }

  const blocked = readRuntimePrerequisites(parent.metadataJson);
  const resumableIntent = asObj(blocked?.resumableIntent) || asObj(childMeta.resumableIntent);

  await bindStoreToMission(prisma, parentMissionId, storeId);
  await patchRuntimePrerequisites(prisma, parentMissionId, {
    status: RUNTIME_PREREQ_STATUS.RESOLVED,
    resolvedAction: 'create_store',
    resolvedStoreId: storeId,
    prerequisiteChildMissionId: cid,
    resolvedAt: new Date().toISOString(),
  });

  let resumeResult = null;
  const autoResume = opts.autoResume !== false;
  if (autoResume && resumableIntent.originalTool && resumableIntent.stepNumber >= 1 && opts.user) {
    await patchRuntimePrerequisites(prisma, parentMissionId, {
      status: RUNTIME_PREREQ_STATUS.RESUMED,
      resumedAt: new Date().toISOString(),
    });
    const { executeMissionStep } = await import('./performerRuntimeKernel.js');
    resumeResult = await executeMissionStep({
      user: opts.user,
      missionId: parentMissionId,
      stepNumber: resumableIntent.stepNumber,
      requestedTool: resumableIntent.originalTool,
      parameters: { ...asObj(resumableIntent.parameters), storeId },
      targetContext: { storeId },
      continuationContract: resumableIntent.continuationContract ?? null,
      source: 'runtime_prerequisite_child_resume',
      traceId: opts.traceId ?? null,
    });
  }

  return {
    ok: true,
    httpStatus: 200,
    code: 'PREREQUISITE_CHILD_COMPLETED',
    parentMissionId,
    childMissionId: cid,
    storeId,
    resumableIntent,
    resumeResult,
  };
}

/**
 * Persist prerequisite block from resolver output before step execution is denied.
 * @param {import('../prisma.js').PrismaClient} prisma
 * @param {string} missionId
 * @param {object} prereqResult
 */
export async function recordPrerequisiteBlock(prisma, missionId, prereqResult) {
  return persistPrerequisiteBlock(prisma, missionId, {
    missingRequirements: prereqResult.missingRequirements ?? [],
    suggestedActions: prereqResult.suggestedActions ?? [],
    resumableIntent: prereqResult.resumableIntent ?? null,
    blockingReason: prereqResult.blockingReason ?? null,
    storeCandidates: prereqResult.storeCandidates ?? [],
    requestedTool: prereqResult.resumableIntent?.originalTool ?? null,
    stepNumber: prereqResult.resumableIntent?.stepNumber ?? null,
  });
}

export default {
  resolvePrerequisiteAction,
  tryResumeAfterPrerequisiteChildCompleted,
  recordPrerequisiteBlock,
};
