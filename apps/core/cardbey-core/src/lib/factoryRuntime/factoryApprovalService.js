/**
 * Factory approval pause/resume — definition-driven plan merge + multi-checkpoint support.
 */

import { randomUUID } from 'crypto';
import { getPrismaClient } from '../prisma.js';
import { mergeMissionContext } from '../mission.js';
import { appendEvent, getEvents, setBlackboardKey } from '../missionBlackboard.js';
import {
  BLACKBOARD_KEY_FACTORY_PENDING,
  BLACKBOARD_KEY_FACTORY_STATE,
  FACTORY_CONTEXT_KEY,
  FACTORY_STATUS_AWAITING_APPROVAL,
  FACTORY_STATUS_AWAITING_FINAL_ASSET_APPROVAL,
  FACTORY_STATUS_CANCELLED,
} from './factoryConstants.js';
import { emitFactoryExecutionResumed } from './factoryTelemetry.js';
import { runFactoryExecution } from './factoryRuntimeExecutor.js';
import { getFactory } from './factoryRegistry.js';
import { mergeApprovedPlanIntoState } from './factoryApprovalPolicy.js';

const PENDING_APPROVAL_STATUSES = new Set([
  FACTORY_STATUS_AWAITING_APPROVAL,
  FACTORY_STATUS_AWAITING_FINAL_ASSET_APPROVAL,
]);

/**
 * @param {string} missionId
 */
export async function loadPendingFactoryExecution(missionId) {
  const mid = String(missionId ?? '').trim();
  if (!mid) return null;

  try {
    const prisma = getPrismaClient();
    const mission = await prisma.mission.findUnique({
      where: { id: mid },
      select: { context: true },
    });
    const ctx = mission?.context;
    if (ctx && typeof ctx === 'object' && !Array.isArray(ctx)) {
      const bundle = ctx[FACTORY_CONTEXT_KEY];
      if (bundle && typeof bundle === 'object' && PENDING_APPROVAL_STATUSES.has(String(bundle.status ?? ''))) {
        return bundle;
      }
    }
  } catch {
    /* fall through */
  }

  try {
    const { events } = await getEvents(mid, 'FACTORY_EXECUTION_PAUSED');
    const latest = events[events.length - 1];
    const state = latest?.payload?.executionState ?? null;
    if (state && PENDING_APPROVAL_STATUSES.has(String(state.status ?? ''))) return state;
    return null;
  } catch {
    return null;
  }
}

/**
 * @param {object} executionState
 */
export async function persistFactoryPending(executionState) {
  const mid = String(executionState?.missionId ?? '').trim();
  if (!mid) return;

  const prisma = getPrismaClient();
  await mergeMissionContext(
    mid,
    {
      [FACTORY_CONTEXT_KEY]: executionState,
    },
    { prisma },
  );

  await setBlackboardKey(mid, BLACKBOARD_KEY_FACTORY_PENDING, executionState, { prisma });
  await setBlackboardKey(
    mid,
    BLACKBOARD_KEY_FACTORY_STATE,
    {
      factoryId: executionState.factoryId,
      stageIndex: executionState.stageIndex,
      status: executionState.status,
      artifactRefs: executionState.artifactRefs ?? [],
      pendingApprovalKind: executionState.pendingApprovalKind ?? null,
    },
    { prisma },
  );
}

/**
 * @param {object} definition
 * @param {string} stageId
 */
function findStageIndex(definition, stageId) {
  const stages = definition?.stages ?? [];
  return stages.findIndex((s) => s.stageId === stageId);
}

/**
 * @param {object} state
 * @param {object|null|undefined} definition
 * @param {string} fromStageId
 */
function clearStageOutputsFrom(state, definition, fromStageId) {
  const stages = definition?.stages ?? [];
  const fromIdx = stages.findIndex((s) => s.stageId === fromStageId);
  const nextOutputs = { ...(state.stageOutputs ?? {}) };
  if (fromIdx < 0) return { ...state, stageOutputs: nextOutputs };
  for (let i = fromIdx; i < stages.length; i += 1) {
    delete nextOutputs[stages[i].stageId];
  }
  return { ...state, stageOutputs: nextOutputs };
}

function findRenderStageId(definition) {
  const stages = definition?.stages ?? [];
  for (const id of ['multi_scene_render', 'execute', 'creative_execute']) {
    if (stages.some((s) => s.stageId === id)) return id;
  }
  return null;
}

/**
 * @param {{
 *   missionId: string;
 *   userId: string;
 *   decision: 'approve' | 'cancel' | 'regenerate' | 'regenerate_scene' | 'regenerate_plan';
 *   editedPlan?: object;
 *   sceneId?: string;
 * }} args
 */
export async function handleFactoryApprovalDecision({ missionId, userId, decision, editedPlan, sceneId }) {
  const mid = String(missionId ?? '').trim();
  const uid = String(userId ?? '').trim();
  if (!mid || !uid) {
    return { ok: false, error: 'validation', message: 'missionId and userId required' };
  }

  const pending = await loadPendingFactoryExecution(mid);
  if (!pending) {
    return { ok: false, error: 'not_found', message: 'No pending factory execution for this mission' };
  }

  const definition = getFactory(pending.factoryId);
  const approvalStageId = pending.currentStageId ?? definition?.approvalPolicy?.approvalStageId ?? 'approval';

  if (decision === 'cancel') {
    const cancelled = {
      ...pending,
      status: FACTORY_STATUS_CANCELLED,
      updatedAt: new Date().toISOString(),
    };
    await persistFactoryPending(cancelled);
    await appendEvent(mid, 'factory_approval_decided', { decision: 'cancel', executionId: pending.executionId });
    return { ok: true, status: FACTORY_STATUS_CANCELLED };
  }

  if (decision === 'regenerate_plan') {
    const planStageId = definition?.approvalPolicy?.approvalStageId ?? 'approval';
    const planIndex = findStageIndex(definition, planStageId);
    if (planIndex < 0) {
      return { ok: false, error: 'regenerate_unsupported', message: 'No plan approval stage found' };
    }
    const fromStage = definition.stages[Math.max(0, planIndex - 1)]?.stageId ?? 'video_plan';
    const cleared = clearStageOutputsFrom(pending, definition, fromStage);
    const regenerated = {
      ...cleared,
      status: 'running',
      stageIndex: planIndex,
      currentStageId: planStageId,
      resumeFromApproval: false,
      resumedApprovalStageId: null,
      regenerationRequested: { at: new Date().toISOString(), userId: uid, level: 'plan' },
      updatedAt: new Date().toISOString(),
    };
    return runFactoryExecution({
      factoryId: pending.factoryId,
      missionId: mid,
      userId: uid,
      intent: pending.intent,
      context: pending.context ?? {},
      resumeState: regenerated,
    });
  }

  if (decision === 'regenerate_scene') {
    const sid = String(sceneId ?? '').trim();
    const renderStageId = findRenderStageId(definition);
    if (!renderStageId || !sid) {
      return { ok: false, error: 'regenerate_scene_unsupported', message: 'sceneId and render stage required' };
    }
    const renderIndex = findStageIndex(definition, renderStageId);
    const nextOutputs = { ...(pending.stageOutputs ?? {}) };
    const renderOut = { ...(nextOutputs[renderStageId] ?? {}) };
    renderOut.sceneClips = (renderOut.sceneClips ?? []).filter((c) => c.sceneId !== sid);
    renderOut.sceneClipRefs = renderOut.sceneClips.map((c) => c.artifactId).filter(Boolean);
    renderOut.renderStatus = 'partial_regenerate';
    renderOut.videoUrl = null;
    renderOut.finalArtifactId = null;
    renderOut.artifact = null;
    nextOutputs[renderStageId] = renderOut;
    for (let i = renderIndex + 1; i < (definition.stages ?? []).length; i += 1) {
      delete nextOutputs[definition.stages[i].stageId];
    }
    const regenerated = {
      ...pending,
      stageOutputs: nextOutputs,
      status: 'running',
      stageIndex: renderIndex,
      currentStageId: renderStageId,
      resumeFromApproval: false,
      resumedApprovalStageId: null,
      regenerationRequested: { at: new Date().toISOString(), userId: uid, level: 'scene', sceneId: sid },
      updatedAt: new Date().toISOString(),
    };
    return runFactoryExecution({
      factoryId: pending.factoryId,
      missionId: mid,
      userId: uid,
      intent: pending.intent,
      context: pending.context ?? {},
      resumeState: regenerated,
    });
  }

  if (decision === 'regenerate') {
    const renderStageId = findRenderStageId(definition);
    if (!renderStageId) {
      return { ok: false, error: 'regenerate_unsupported', message: 'Factory has no render stage to regenerate' };
    }
    const renderIndex = findStageIndex(definition, renderStageId);
    const cleared = clearStageOutputsFrom(pending, definition, renderStageId);
    const regenerated = {
      ...cleared,
      status: 'running',
      stageIndex: renderIndex,
      currentStageId: renderStageId,
      resumeFromApproval: false,
      resumedApprovalStageId: null,
      regenerationRequested: { at: new Date().toISOString(), userId: uid, fromStageId: approvalStageId, level: 'final_render' },
      updatedAt: new Date().toISOString(),
    };
    await appendEvent(mid, 'factory_approval_decided', {
      decision: 'regenerate',
      executionId: pending.executionId,
      stageIndex: renderIndex,
    });
    return runFactoryExecution({
      factoryId: pending.factoryId,
      missionId: mid,
      userId: uid,
      intent: pending.intent,
      context: pending.context ?? {},
      resumeState: regenerated,
    });
  }

  const mergedState =
    pending.pendingApprovalKind === 'plan' || pending.status === FACTORY_STATUS_AWAITING_APPROVAL
      ? mergeApprovedPlanIntoState(pending, definition, editedPlan)
      : pending;

  const resumedState = {
    ...mergedState,
    status: 'running',
    stageIndex: (pending.stageIndex ?? 0) + 1,
    approvalDecision: { decision: 'approve', at: new Date().toISOString(), userId: uid, stageId: approvalStageId },
    resumeFromApproval: true,
    resumedApprovalStageId: approvalStageId,
    pendingApprovalKind: null,
    updatedAt: new Date().toISOString(),
  };

  emitFactoryExecutionResumed({
    factoryId: pending.factoryId,
    missionId: mid,
    userId: uid,
    stageId: approvalStageId,
    stageIndex: resumedState.stageIndex,
  });

  await appendEvent(mid, 'factory_approval_decided', {
    decision: 'approve',
    executionId: pending.executionId,
    stageIndex: resumedState.stageIndex,
    stageId: approvalStageId,
  });

  return runFactoryExecution({
    factoryId: pending.factoryId,
    missionId: mid,
    userId: uid,
    intent: pending.intent,
    context: pending.context ?? {},
    resumeState: resumedState,
  });
}

/**
 * @param {object} base
 */
export function createFactoryExecutionState(base) {
  return {
    executionId: base.executionId ?? `factory-exec-${randomUUID()}`,
    factoryId: base.factoryId,
    missionId: base.missionId,
    userId: base.userId,
    intent: base.intent ?? '',
    context: base.context ?? {},
    stageIndex: base.stageIndex ?? 0,
    stageOutputs: base.stageOutputs ?? {},
    artifactRefs: base.artifactRefs ?? [],
    status: base.status ?? 'running',
    currentStageId: base.currentStageId ?? null,
    createdAt: base.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
