/**
 * Runtime Session — authoritative rehydration for Performer mount / refresh.
 * Read-only resolution; mutations via resumeMission / selectStoreForSession.
 */

import { getPrismaClient } from '../prisma.js';
import { getTenantId } from '../missionAccess.js';
import {
  isTerminalMissionPipelineStatus,
  isSuccessfulTerminalMissionPipelineStatus,
} from '../missionPipelineTerminalStatus.js';
import {
  resolveContinuationContract,
  parseClientContinuationContract,
} from '../missionContinuationService.js';
import { hydrateCompletedStepNumbers, readProactiveStepStatusMap } from './runtimeStepState.js';
import { readRuntimePrerequisites } from './runtimePrerequisiteState.js';
import { advanceProactivePipelineStep } from '../orchestrator/advanceProactivePipelineStep.js';
import {
  getRuntimeCapabilities,
  requireRuntimeCapability,
} from './runtimeCapabilitiesService.js';
import {
  resolveTargetReadiness,
  resolveTargetIdsFromMission,
  STORE_READINESS,
} from './runtimeTargetReadinessService.js';
import { resolveRuntimeGuidanceForSession } from './runtimeGuidanceService.js';
import { getMissionParentMissionId } from '../mission/missionParentLineage.js';

function envTruthy(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') return defaultValue;
  const v = String(raw).trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export function isRuntimeSessionRehydrationEnabled() {
  return getRuntimeCapabilities().runtimeSessionRehydration;
}

export function isRuntimeStoreFallbackEnabled() {
  return getRuntimeCapabilities().runtimeSessionRehydration && envTruthy('ENABLE_RUNTIME_STORE_FALLBACK', false);
}

export function isRuntimeMissionResumeEnabled() {
  return getRuntimeCapabilities().runtimeMissionResume;
}

export function isRuntimeTargetReadinessEnabled() {
  return getRuntimeCapabilities().runtimeTargetReadiness;
}

/** MissionPipeline statuses considered active / resumable (not terminal). */
export const RECOVERABLE_MISSION_STATUSES = [
  'requested',
  'planned',
  'awaiting_confirmation',
  'awaiting_input',
  'queued',
  'executing',
  'paused',
  'running',
  'draft',
];

const CHECKPOINT_MISSION_SELECT = {
  id: true,
  type: true,
  title: true,
  status: true,
  runState: true,
  executionMode: true,
  targetType: true,
  targetId: true,
  metadataJson: true,
  outputsJson: true,
  createdBy: true,
  tenantId: true,
  updatedAt: true,
  currentStepId: true,
};

function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function asObj(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function missionOwnedByUser(row, userId, tenantId) {
  if (!row) return false;
  const uid = str(userId);
  if (!uid) return false;
  if (str(row.createdBy) === uid) return true;
  if (str(row.tenantId) === uid) return true;
  if (tenantId && str(row.tenantId) === str(tenantId)) return true;
  return false;
}

function resolveStoreIdFromMissionRow(row) {
  const ids = resolveTargetIdsFromMission(row);
  return ids.storeId || null;
}

function mapMissionSummary(row, extras = {}) {
  if (!row) return null;
  const meta = asObj(row.metadataJson);
  const runtimePrerequisites = readRuntimePrerequisites(meta);
  return {
    missionId: row.id,
    type: row.type ?? null,
    title: row.title ?? null,
    status: row.status ?? null,
    runState: row.runState ?? null,
    currentStepId: row.currentStepId ?? extras.currentStepId ?? null,
    executionMode: row.executionMode ?? null,
    targetType: row.targetType ?? null,
    targetId: row.targetId ?? null,
    parentMissionId: getMissionParentMissionId(row),
    storeId: resolveStoreIdFromMissionRow(row),
    proactiveStepStatus: readProactiveStepStatusMap(meta),
    completedStepNumbers: hydrateCompletedStepNumbers(meta),
    stepOutputKeys: Object.keys(asObj(meta.stepOutputs)),
    runtimePrerequisites,
    updatedAt: row.updatedAt ?? null,
    isTerminal: isTerminalMissionPipelineStatus(row.status, { runState: row.runState }),
    isSuccessTerminal: isSuccessfulTerminalMissionPipelineStatus(row.status, {
      runState: row.runState,
    }),
    ...(extras.activeCheckpoint ? { activeCheckpoint: extras.activeCheckpoint } : {}),
    ...(extras.checkpointContinuation ? { checkpointContinuation: extras.checkpointContinuation } : {}),
  };
}

async function loadCheckpointExtrasForMission(missionId) {
  const mid = str(missionId);
  if (!mid) return { activeCheckpoint: null, checkpointContinuation: null, currentStepId: null };
  try {
    const { resolveMissionState } = await import('../missionPipelineResolver.js');
    const state = await resolveMissionState(mid);
    if (!state) return { activeCheckpoint: null, checkpointContinuation: null, currentStepId: null };
    const cp = state.activeCheckpoint ?? state.pendingCheckpoint ?? null;
    const meta = asObj(state.metadata);
    const checkpointContinuation =
      meta.checkpointContinuation && typeof meta.checkpointContinuation === 'object'
        ? meta.checkpointContinuation
        : meta.continuationPayload && typeof meta.continuationPayload === 'object'
          ? meta.continuationPayload
          : null;
    return {
      activeCheckpoint: cp,
      checkpointContinuation,
      currentStepId: state.currentStep?.stepId ?? cp?.stepId ?? null,
    };
  } catch {
    return { activeCheckpoint: null, checkpointContinuation: null, currentStepId: null };
  }
}

async function loadUserStores(userId, limit = 20) {
  const uid = str(userId);
  if (!uid) return [];
  const prisma = getPrismaClient();
  const rows = await prisma.business.findMany({
    where: { userId: uid },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: { id: true, name: true, slug: true, updatedAt: true, publishedAt: true },
  });
  return rows.map((b) => ({
    storeId: b.id,
    name: b.name ?? null,
    slug: b.slug ?? null,
    updatedAt: b.updatedAt ?? null,
    publishedAt: b.publishedAt ?? null,
  }));
}

async function resolveLatestStoreTargetForUser(prisma, userId, tenantId) {
  const uid = str(userId);
  if (!uid) return { storeId: null, draftId: null, source: null };

  const storeMission = await prisma.missionPipeline.findFirst({
    where: {
      OR: [{ createdBy: uid }, { tenantId: tenantId || uid }],
      type: 'store',
      status: { in: ['completed', 'done', 'executing', 'running'] },
      targetId: { not: null },
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      targetId: true,
      targetType: true,
      metadataJson: true,
      outputsJson: true,
      createdBy: true,
      tenantId: true,
    },
  });
  if (storeMission && missionOwnedByUser(storeMission, uid, tenantId)) {
    const ids = resolveTargetIdsFromMission(storeMission);
    if (ids.storeId) {
      return { storeId: ids.storeId, draftId: ids.draftId, source: 'latest_store_mission' };
    }
  }

  const draft = await prisma.draftStore.findFirst({
    where: {
      ownerUserId: uid,
      status: { in: ['ready', 'committed', 'generating', 'draft'] },
    },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, committedStoreId: true },
  });
  if (draft) {
    return {
      storeId: str(draft.committedStoreId) || null,
      draftId: draft.id,
      source: 'latest_draft',
    };
  }

  return { storeId: null, draftId: null, source: null };
}

async function findMissionForUser(prisma, missionId, userId, tenantId) {
  const mid = str(missionId);
  if (!mid) return null;
  const row = await prisma.missionPipeline.findUnique({
    where: { id: mid },
    select: {
      id: true,
      type: true,
      title: true,
      status: true,
      runState: true,
      executionMode: true,
      targetType: true,
      targetId: true,
      metadataJson: true,
      outputsJson: true,
      createdBy: true,
      tenantId: true,
      updatedAt: true,
    },
  });
  if (!row || !missionOwnedByUser(row, userId, tenantId)) return null;
  return row;
}

/**
 * @param {{
 *   userId: string;
 *   user?: object;
 *   requestedMissionId?: string|null;
 *   requestedStoreId?: string|null;
 *   source?: string;
 * }} input
 */
export async function resolveActiveRuntimeSession(input) {
  const userId = str(input?.userId);
  const user = input?.user ?? null;
  const tenantId = user ? getTenantId(user) : userId;
  const requestedMissionId = str(input?.requestedMissionId);
  const requestedStoreId = str(input?.requestedStoreId);
  const source = str(input?.source) || 'runtime_session';

  /** @type {string[]} */
  const warnings = [];
  const prisma = getPrismaClient();

  let activeMissionRow = null;
  let activeMissionId = null;
  let continuationContract = null;

  // ── 1. Explicit requestedMissionId (non-terminal OR success-terminal with recoverable plan) ──
  if (requestedMissionId) {
    const row = await findMissionForUser(prisma, requestedMissionId, userId, tenantId);
    if (row) {
      const terminal = isTerminalMissionPipelineStatus(row.status, { runState: row.runState });
      const successTerminal = isSuccessfulTerminalMissionPipelineStatus(row.status, {
        runState: row.runState,
      });
      if (!terminal || successTerminal) {
        activeMissionRow = row;
        activeMissionId = row.id;
      } else {
        warnings.push('REQUESTED_MISSION_TERMINAL');
      }
    } else {
      warnings.push('REQUESTED_MISSION_NOT_FOUND');
    }
  }

  // ── 2b. Blocked checkpoint mission (refresh must restore logo / owner-input step) ──
  if (!activeMissionRow && userId) {
    const checkpointRow = await prisma.missionPipeline.findFirst({
      where: {
        status: 'awaiting_input',
        runState: 'blocked_on_checkpoint',
        OR: [{ createdBy: userId }, { tenantId: tenantId || userId }],
      },
      orderBy: { updatedAt: 'desc' },
      select: CHECKPOINT_MISSION_SELECT,
    });
    if (checkpointRow && missionOwnedByUser(checkpointRow, userId, tenantId)) {
      activeMissionRow = checkpointRow;
      activeMissionId = checkpointRow.id;
    }
  }

  // ── 3. Latest active/recoverable mission ──
  if (!activeMissionRow && userId) {
    const row = await prisma.missionPipeline.findFirst({
      where: {
        status: { in: RECOVERABLE_MISSION_STATUSES },
        OR: [{ createdBy: userId }, { tenantId: tenantId || userId }],
      },
      orderBy: { updatedAt: 'desc' },
      select: CHECKPOINT_MISSION_SELECT,
    });
    if (row && missionOwnedByUser(row, userId, tenantId)) {
      activeMissionRow = row;
      activeMissionId = row.id;
    }
  }

  // ── 4. Latest completed store mission with targetId (continuation context) ──
  if (!activeMissionRow && userId && getRuntimeCapabilities().missionHandoff) {
    const row = await prisma.missionPipeline.findFirst({
      where: {
        createdBy: userId,
        status: { in: ['completed', 'done', 'succeeded', 'success'] },
        targetId: { not: null },
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        type: true,
        title: true,
        status: true,
        runState: true,
        executionMode: true,
        targetType: true,
        targetId: true,
        metadataJson: true,
        outputsJson: true,
        createdBy: true,
        tenantId: true,
        updatedAt: true,
      },
    });
    if (row) {
      activeMissionRow = row;
      activeMissionId = row.id;
      try {
        continuationContract = await resolveContinuationContract(row.id);
      } catch {
        warnings.push('CONTINUATION_RECOVERY_FAILED');
      }
    }
  }

  // ── Store resolution ──
  let activeStoreId = null;
  let targetType = null;
  let targetId = null;

  if (requestedStoreId && (isRuntimeStoreFallbackEnabled() || isRuntimeTargetReadinessEnabled())) {
    const owned = await prisma.business.findFirst({
      where: { id: requestedStoreId, userId },
      select: { id: true },
    });
    if (owned) {
      activeStoreId = requestedStoreId;
    } else {
      warnings.push('REQUESTED_STORE_NOT_OWNED');
    }
  }

  if (!activeStoreId && activeMissionRow) {
    const sid = resolveStoreIdFromMissionRow(activeMissionRow);
    if (sid && sid !== 'temp') {
      activeStoreId = sid;
      targetType = str(activeMissionRow.targetType) || 'store';
      targetId = str(activeMissionRow.targetId) || sid;
    }
  }

  const readinessEnabled = isRuntimeTargetReadinessEnabled();
  const storeFallbackEnabled = isRuntimeStoreFallbackEnabled() || readinessEnabled;

  if (!activeStoreId && userId && (storeFallbackEnabled || readinessEnabled)) {
    const latest = await resolveLatestStoreTargetForUser(prisma, userId, tenantId);
    if (latest.storeId) {
      activeStoreId = latest.storeId;
      targetType = 'store';
      targetId = latest.storeId;
    }
  }

  const userStores = storeFallbackEnabled ? await loadUserStores(userId) : [];

  if (!activeStoreId && userStores.length === 1) {
    activeStoreId = userStores[0].storeId;
    targetType = 'store';
    targetId = userStores[0].storeId;
  }

  const requiresStoreSelection = !activeStoreId && userStores.length > 1;

  let targetReadiness = null;
  if (readinessEnabled && userId) {
    const missionIds = resolveTargetIdsFromMission(activeMissionRow);
    targetReadiness = await resolveTargetReadiness({
      targetType: targetType || 'store',
      targetId: activeStoreId || targetId,
      userId,
      mission: activeMissionRow,
      runtimeContext: {
        storeId: activeStoreId,
        activeStoreId,
        draftId: missionIds.draftId,
      },
    });
    if (!activeStoreId && targetReadiness?.storeId) {
      activeStoreId = targetReadiness.storeId;
      targetType = 'store';
      targetId = targetReadiness.storeId;
    }
  }

  const runtimePrerequisitesEarly = activeMissionRow
    ? readRuntimePrerequisites(asObj(activeMissionRow.metadataJson))
    : null;
  const waitingForPrerequisiteEarly =
    runtimePrerequisitesEarly &&
    str(runtimePrerequisitesEarly.status) === 'waiting_for_prerequisite';

  const needsStoreFirst = readinessEnabled
    ? Boolean(
        targetReadiness &&
          !targetReadiness.exists &&
          targetReadiness.readinessState === STORE_READINESS.MISSING &&
          !waitingForPrerequisiteEarly,
      )
    : userStores.length === 0 && !activeStoreId;

  if (needsStoreFirst) {
    warnings.push('NEEDS_STORE_FIRST');
  }

  if (activeMissionRow && !continuationContract && getRuntimeCapabilities().missionHandoff) {
    const successTerminal = isSuccessfulTerminalMissionPipelineStatus(activeMissionRow.status, {
      runState: activeMissionRow.runState,
    });
    if (successTerminal) {
      try {
        continuationContract = await resolveContinuationContract(activeMissionRow.id);
      } catch {
        /* best-effort */
      }
    }
  }

  const meta = asObj(activeMissionRow?.metadataJson);
  const storedContract = parseClientContinuationContract(meta.continuationContract);
  if (storedContract) {
    continuationContract = storedContract;
  }

  const proactivePlanPayload = asObj(meta.proactivePlan);
  const proactivePlanSteps = Array.isArray(proactivePlanPayload.plan)
    ? proactivePlanPayload.plan
    : Array.isArray(meta.proactivePlanSteps)
      ? meta.proactivePlanSteps
      : [];

  /** @type {object[]} */
  const recoverableMissions = [];
  if (userId) {
    const rows = await prisma.missionPipeline.findMany({
      where: {
        OR: [{ createdBy: userId }, { tenantId: tenantId || userId }],
        status: { in: [...RECOVERABLE_MISSION_STATUSES, 'completed', 'done'] },
      },
      orderBy: { updatedAt: 'desc' },
      take: 8,
      select: {
        id: true,
        type: true,
        title: true,
        status: true,
        runState: true,
        executionMode: true,
        targetType: true,
        targetId: true,
        metadataJson: true,
        outputsJson: true,
        createdBy: true,
        tenantId: true,
        updatedAt: true,
      },
    });
    for (const r of rows) {
      if (missionOwnedByUser(r, userId, tenantId)) {
        recoverableMissions.push(mapMissionSummary(r));
      }
    }
  }

  let checkpointExtras = { activeCheckpoint: null, checkpointContinuation: null, currentStepId: null };
  if (activeMissionRow && str(activeMissionRow.status) === 'awaiting_input') {
    checkpointExtras = await loadCheckpointExtrasForMission(activeMissionRow.id);
  }

  const activeMission = mapMissionSummary(activeMissionRow, checkpointExtras);
  const latestStore = userStores[0] ?? null;

  const pendingProactiveStepNumber = (() => {
    if (!activeMission?.completedStepNumbers) return null;
    const rp = activeMission.runtimePrerequisites;
    if (rp && str(rp.status) === 'waiting_for_prerequisite') {
      const stepN = Math.floor(Number(rp.stepNumber ?? rp.resumableIntent?.stepNumber));
      return Number.isFinite(stepN) && stepN >= 1 ? stepN : null;
    }
    const completed = new Set(activeMission.completedStepNumbers);
    const statusMap = activeMission.proactiveStepStatus ?? {};
    for (let n = 1; n <= 12; n++) {
      const row = statusMap[String(n)];
      const st = str(row?.status).toLowerCase();
      if (st === 'running') return n;
      if (!completed.has(n) && (st === 'pending' || !st)) return n;
    }
    return null;
  })();

  const runtimePrerequisites = activeMission?.runtimePrerequisites ?? null;
  const waitingForPrerequisite =
    runtimePrerequisites && str(runtimePrerequisites.status) === 'waiting_for_prerequisite';

  const runtimeGuidance = isRuntimeTargetReadinessEnabled()
    ? resolveRuntimeGuidanceForSession({
        missionId: activeMissionId,
        activeStoreId,
        waitingForPrerequisite,
        runtimePrerequisites,
        requiresStoreSelection,
        storeCandidates: requiresStoreSelection ? userStores : userStores.length > 1 ? userStores : [],
        needsStoreFirst,
        targetReadiness,
      })
    : [];

  return {
    ok: true,
    source,
    activeMissionId,
    activeStoreId,
    targetType,
    targetId,
    continuationContract,
    activeMission,
    recoverableMissions,
    latestStore,
    storeCandidates: requiresStoreSelection ? userStores : userStores.length > 1 ? userStores : [],
    requiresStoreSelection,
    needsStoreFirst,
    pendingProactiveStepNumber,
    runtimePrerequisites,
    waitingForPrerequisite,
    targetReadiness,
    readinessGuidance: targetReadiness?.guidanceMessage ?? null,
    recommendedActions: targetReadiness?.recommendedActions ?? [],
    runtimeGuidance,
    proactiveStepStatus: activeMission?.proactiveStepStatus ?? {},
    completedStepNumbers: activeMission?.completedStepNumbers ?? [],
    proactivePlanSteps,
    proactivePlanTotal: proactivePlanSteps.length,
    activeCheckpoint: checkpointExtras.activeCheckpoint,
    checkpointContinuation: checkpointExtras.checkpointContinuation,
    hasActiveCheckpoint: Boolean(checkpointExtras.activeCheckpoint?.stepId),
    warnings,
  };
}

/**
 * @param {{ userId: string; user?: object; storeId: string }} input
 */
export async function selectStoreForSession(input) {
  const userId = str(input?.userId);
  const storeId = str(input?.storeId);
  if (!userId || !storeId) {
    return { ok: false, code: 'INVALID_REQUEST', message: 'userId and storeId required' };
  }
  const prisma = getPrismaClient();
  const business = await prisma.business.findFirst({
    where: { id: storeId, userId },
    select: { id: true, name: true, slug: true, updatedAt: true },
  });
  if (!business) {
    return { ok: false, code: 'STORE_NOT_FOUND', message: 'Store not found or access denied' };
  }
  return resolveActiveRuntimeSession({
    userId,
    user: input.user,
    requestedStoreId: storeId,
    source: 'runtime_session_select_store',
  });
}

/**
 * @param {{ userId: string; user?: object; missionId: string; source?: string }} input
 */
export async function resumeMissionForSession(input) {
  const resumeGate = requireRuntimeCapability('runtimeMissionResume', {
    source: 'runtime_session_service',
    missionId,
  });
  if (!resumeGate.ok) {
    return {
      ok: false,
      code: resumeGate.code,
      capability: resumeGate.capability,
      message: resumeGate.message,
    };
  }

  const userId = str(input?.userId);
  const missionId = str(input?.missionId);
  const tenantId = input?.user ? getTenantId(input.user) : userId;
  if (!userId || !missionId) {
    return { ok: false, code: 'INVALID_REQUEST', message: 'userId and missionId required' };
  }

  const prisma = getPrismaClient();
  const row = await findMissionForUser(prisma, missionId, userId, tenantId);
  if (!row) {
    return { ok: false, code: 'NOT_FOUND', message: 'Mission not found or access denied' };
  }

  const st = str(row.status).toLowerCase();
  if (st === 'queued' || st === 'planned' || st === 'requested') {
    const adv = await advanceProactivePipelineStep(prisma, {
      missionId,
      executionMode: row.executionMode,
      data: { status: 'executing', runState: 'running' },
      source: input.source ?? 'runtime_session_resume',
      correlationId: missionId,
    });
    if (!adv.ok) {
      return { ok: false, code: adv.code ?? 'RESUME_FAILED', message: adv.message ?? 'Resume failed' };
    }
  }

  const session = await resolveActiveRuntimeSession({
    userId,
    user: input.user,
    requestedMissionId: missionId,
    source: 'runtime_session_resume',
  });

  return { ok: true, resumed: true, missionId, session };
}
