/**
 * topologyExecutor — run approved topology (Phase 4: DAG node dispatch).
 */

import { getPrismaClient } from '../prisma.js';
import { canTransitionMissionPipeline } from '../missionPipelineTransitions.js';
import { safePipelineUpdate } from '../safePipelineUpdate.js';
import { readMetadata, writeMetadata } from '../persistence/metadataWriter.js';
import { runTopologyNodes } from './topologyNodeRunner.js';
import {
  buildAndValidateExecutionDraft,
  attachmentAnalysisAsEvidence,
} from './topologyExecutionDraft.js';
import { extractLoyaltyDraftArtifactFromNodeRun } from '../toolExecutors/loyalty/loyaltyProgramDraftArtifactService.js';
import { readMissionContract } from '../kernel/missionContract.js';
import { resolveMissionArtifactAuthority } from './artifactAuthority.js';
import { withCanonicalRuntimeState } from '../runtime/canonicalRuntimeState.js';

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

/**
 * Completed store/other missions can still carry pending topology metadata after compiler remount.
 * Reopen them for HITL approval instead of hard-failing Approve & Execute.
 * @param {Record<string, unknown> | null | undefined} meta
 */
export function canReopenCompletedTopologyMission(meta) {
  if (!meta || typeof meta !== 'object') return false;
  const pending = meta.pendingTopology;
  const hasPending =
    pending &&
    typeof pending === 'object' &&
    !Array.isArray(pending) &&
    Array.isArray(pending.nodes) &&
    pending.nodes.length > 0;
  if (!hasPending) return false;

  const multiStatus = String(meta.multiAgentStatus ?? '').trim().toLowerCase();
  const approvalStatus = String(meta.approvalStatus ?? '').trim().toLowerCase();
  return (
    multiStatus === 'pending_approval' ||
    multiStatus === 'approved' ||
    approvalStatus === 'pending' ||
    approvalStatus === 'approved'
  );
}

/**
 * Loyalty topology must materialize a draft artifact before marking completed.
 * @param {TopologyExecutionMode} executionMode
 * @param {Record<string, unknown>} nodeRun
 * @returns {'completed' | 'failed'}
 */
function resolveLoyaltyPipelineStatus(executionMode, nodeRun) {
  if (executionMode !== 'loyalty' || nodeRun.status !== 'completed') {
    return nodeRun.status === 'completed'
      ? 'completed'
      : nodeRun.status === 'awaiting_owner_input'
        ? 'awaiting_owner_input'
        : 'failed';
  }
  const artifact = extractLoyaltyDraftArtifactFromNodeRun(nodeRun);
  return artifact ? 'completed' : 'failed';
}
import { emitTopologyBlackboardEvent } from './topologyExecutionTelemetry.js';

/** @typedef {'campaign' | 'store' | 'loyalty' | 'generic'} TopologyExecutionMode */

/**
 * @param {string | null | undefined} missionType
 * @param {Record<string, unknown> | null | undefined} [metadata]
 * @returns {TopologyExecutionMode}
 */
export function resolveTopologyExecutionMode(missionType, metadata = null) {
  const type = String(missionType ?? '').trim().toLowerCase();
  const source = String(metadata?.source ?? '').trim().toLowerCase();
  const compilerTool = String(metadata?.compilerTool ?? metadata?.tool ?? '').trim().toLowerCase();

  if (
    type === 'launch_campaign' ||
    type === 'campaign' ||
    type === 'campaign_orchestration' ||
    compilerTool === 'create_campaign' ||
    compilerTool === 'launch_campaign'
  ) {
    return 'campaign';
  }

  if (
    type === 'setup_loyalty_program' ||
    type === 'create_loyalty_program' ||
    type === 'loyalty' ||
    type === 'loyalty_campaign' ||
    compilerTool === 'setup_loyalty_program' ||
    compilerTool === 'create_loyalty_program' ||
    source === 'dashboard_loyalty_card_scan' ||
    source === 'loyalty_spine'
  ) {
    return 'loyalty';
  }

  if (
    type === 'store' ||
    type === 'store_creation_workflow' ||
    type === 'create_store' ||
    source === 'store_creation'
  ) {
    return 'store';
  }

  return 'generic';
}

/**
 * @param {import('../lib/prisma.js').PrismaClient} prisma
 * @param {string} missionId
 * @param {string} fromStatus
 * @param {string} toStatus
 * @param {Record<string, unknown>} [extra]
 */
async function transitionMissionStatus(prisma, missionId, fromStatus, toStatus, extra = {}) {
  if (!canTransitionMissionPipeline(fromStatus, toStatus)) return false;
  const result = await safePipelineUpdate(
    prisma,
    {
      where: { id: missionId, status: fromStatus },
      data: { status: toStatus, ...extra },
    },
    { label: `topologyExecutor.${fromStatus}_to_${toStatus}`, missionId },
  );
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[topologyExecutor] transition: ${fromStatus} -> ${toStatus} mission=${missionId}`);
  }
  return Boolean(result);
}

/**
 * Advance mission through valid pipeline transitions before topology execution.
 *
 * @param {import('../lib/prisma.js').PrismaClient} prisma
 * @param {string} missionId
 */
export async function ensureMissionReadyForTopologyExecution(prisma, missionId) {
  const row = await prisma.missionPipeline.findUnique({
    where: { id: missionId },
    select: { status: true },
  });
  if (!row) throw new Error(`MissionPipeline not found: ${missionId}`);

  let status = String(row.status ?? '').trim();

  if (status === 'completed') {
    const meta = await readMetadata(missionId);
    if (canReopenCompletedTopologyMission(meta)) {
      await safePipelineUpdate(
        prisma,
        {
          where: { id: missionId },
          data: {
            status: 'awaiting_confirmation',
            completedAt: null,
            runState: 'idle',
          },
        },
        { label: 'topologyExecutor.reopen_completed_for_plan', missionId },
      );
      status = 'awaiting_confirmation';
    }
  }

  if (status === 'awaiting_confirmation') {
    const moved = await transitionMissionStatus(prisma, missionId, 'awaiting_confirmation', 'queued');
    if (!moved) {
      throw new Error(`Cannot transition mission ${missionId} from awaiting_confirmation to queued`);
    }
    status = 'queued';
  }

  if (status === 'awaiting_owner_input') {
    const moved = await transitionMissionStatus(prisma, missionId, 'awaiting_owner_input', 'executing', {
      runState: 'running',
      startedAt: new Date(),
    });
    if (!moved) {
      throw new Error(`Cannot transition mission ${missionId} from awaiting_owner_input to executing`);
    }
    return 'executing';
  }

  if (status === 'queued') {
    const moved = await transitionMissionStatus(prisma, missionId, 'queued', 'executing', {
      runState: 'running',
      startedAt: new Date(),
    });
    if (!moved) {
      throw new Error(`Cannot transition mission ${missionId} from queued to executing`);
    }
    return 'executing';
  }

  if (status === 'executing') {
    await safePipelineUpdate(
      prisma,
      {
        where: { id: missionId },
        data: { runState: 'running', startedAt: new Date() },
      },
      { label: 'topologyExecutor.resume_executing', missionId },
    );
    return 'executing';
  }

  if (status === 'failed') {
    const moved = await transitionMissionStatus(prisma, missionId, 'failed', 'queued');
    if (!moved) {
      throw new Error(`Cannot retry mission ${missionId} from failed`);
    }
    const executing = await transitionMissionStatus(prisma, missionId, 'queued', 'executing', {
      runState: 'running',
      startedAt: new Date(),
    });
    if (!executing) {
      throw new Error(`Cannot transition retried mission ${missionId} to executing`);
    }
    return 'executing';
  }

  throw new Error(`Mission ${missionId} is ${status}; cannot start topology execution`);
}

/**
 * @param {import('../lib/prisma.js').PrismaClient} prisma
 * @param {string} missionId
 * @param {'completed' | 'failed' | 'awaiting_owner_input'} finalStatus
 * @param {Record<string, unknown>} extra
 */
async function finalizeMissionStatus(prisma, missionId, finalStatus, extra = {}) {
  const fromStatus = 'executing';
  const runState =
    finalStatus === 'completed' ? 'done' : finalStatus === 'awaiting_owner_input' ? 'running' : 'failed';
  const completedAt = finalStatus === 'awaiting_owner_input' ? undefined : new Date();
  const runtimeState =
    finalStatus === 'completed'
      ? 'completed'
      : finalStatus === 'awaiting_owner_input'
        ? 'awaiting_owner_input'
        : 'failed';

  const pipelineData = {
    runState,
    ...(completedAt ? { completedAt } : {}),
    ...extra,
  };

  if (!canTransitionMissionPipeline(fromStatus, finalStatus)) {
    await safePipelineUpdate(
      prisma,
      {
        where: { id: missionId },
        data: {
          status: finalStatus,
          ...pipelineData,
        },
      },
      { label: `topologyExecutor.finalize_${finalStatus}`, missionId },
    );
  } else {
    await transitionMissionStatus(prisma, missionId, fromStatus, finalStatus, pipelineData);
  }

  // Canonical runtime state lives in metadataJson — MissionPipeline has no runtimeState column.
  await writeMetadata(missionId, {
    runtimeState,
    executionState: runtimeState,
  });
}

/**
 * @param {Record<string, unknown>} pipelineMeta
 * @param {{ userId?: string; storeId?: string; missionType?: string; executionMode?: TopologyExecutionMode; missionId?: string }} context
 * @returns {Record<string, unknown>}
 */
function buildExecutionContext(pipelineMeta, context) {
  const persisted =
    pipelineMeta.executionContext && typeof pipelineMeta.executionContext === 'object'
      ? pipelineMeta.executionContext
      : {};
  const storeId =
    context.storeId ??
    persisted.storeId ??
    pipelineMeta.storeId ??
    pipelineMeta.targetId ??
    null;
  return {
    missionId: context.missionId,
    userId: context.userId ?? pipelineMeta.userId ?? null,
    storeId,
    spaceId: persisted.spaceId ?? storeId,
    tenantId: pipelineMeta.tenantId ?? context.userId ?? null,
    goal:
      typeof pipelineMeta.goal === 'string' && pipelineMeta.goal.trim()
        ? pipelineMeta.goal.trim()
        : null,
    executionMode: context.executionMode ?? 'generic',
    missionType: context.missionType ?? null,
    source: pipelineMeta.source ?? null,
    brandTheme:
      persisted.brandTheme ??
      (pipelineMeta.brandTheme && typeof pipelineMeta.brandTheme === 'object'
        ? pipelineMeta.brandTheme
        : null),
    businessType: persisted.businessType ?? pipelineMeta.businessType ?? null,
    location: persisted.location ?? null,
    currency: persisted.currency ?? null,
    timezone: persisted.timezone ?? null,
    selectedStore:
      persisted.selectedStore ??
      (pipelineMeta.selectedStore && typeof pipelineMeta.selectedStore === 'object'
        ? pipelineMeta.selectedStore
        : null),
    storeLocked: persisted.storeLocked === true || pipelineMeta.storeLocked === true,
    selectionMethod: persisted.selectionMethod ?? pipelineMeta.selectionMethod ?? null,
    preseededDraft:
      pipelineMeta.preseededDraft && typeof pipelineMeta.preseededDraft === 'object'
        ? pipelineMeta.preseededDraft
        : pipelineMeta.intentParameters?.preseededDraft &&
            typeof pipelineMeta.intentParameters.preseededDraft === 'object'
          ? pipelineMeta.intentParameters.preseededDraft
          : null,
    ownerInput:
      pipelineMeta.ownerInput && typeof pipelineMeta.ownerInput === 'object'
        ? pipelineMeta.ownerInput
        : null,
    executionDraft:
      pipelineMeta.executionDraft && typeof pipelineMeta.executionDraft === 'object'
        ? pipelineMeta.executionDraft
        : null,
    attachmentAnalysis:
      pipelineMeta.attachmentAnalysis && typeof pipelineMeta.attachmentAnalysis === 'object'
        ? pipelineMeta.attachmentAnalysis
        : pipelineMeta.intentParameters?.attachmentAnalysis &&
            typeof pipelineMeta.intentParameters.attachmentAnalysis === 'object'
          ? pipelineMeta.intentParameters.attachmentAnalysis
          : null,
  };
}

/**
 * @param {string} missionId
 * @param {import('../artifact/types.ts').TopologyArtifact | Record<string, unknown>} topology
 * @param {{ userId?: string; storeId?: string; missionType?: string; executionMode?: TopologyExecutionMode; missionId?: string }} [context]
 */
export async function executeApprovedTopology(missionId, topology, context = {}) {
  const mid = String(missionId ?? '').trim();
  if (!mid) throw new Error('topologyExecutor requires missionId');

  const nodes = Array.isArray(topology?.nodes) ? topology.nodes : [];
  if (!nodes.length) {
    throw new Error('topologyExecutor requires approved topology with nodes');
  }

  const prisma = getPrismaClient();
  const pipeline = await prisma.missionPipeline.findUnique({
    where: { id: mid },
    select: { type: true, metadataJson: true, outputsJson: true, targetId: true, targetType: true },
  });

  const pipelineMeta =
    pipeline?.metadataJson && typeof pipeline.metadataJson === 'object' && !Array.isArray(pipeline.metadataJson)
      ? pipeline.metadataJson
      : {};
  const missionContract = await readMissionContract(mid);

  const executionMode =
    context.executionMode ??
    resolveTopologyExecutionMode(pipeline?.type ?? context.missionType, pipelineMeta);

  const resolvedStoreId =
    context.storeId ??
    (typeof pipelineMeta.storeId === 'string' ? pipelineMeta.storeId : null) ??
    (pipeline?.targetType === 'store' && pipeline?.targetId ? pipeline.targetId : null);

  await writeMetadata(mid, {
    multiAgentStatus: 'executing',
    approvalStatus: 'approved',
    executionStartedAt: new Date().toISOString(),
    executionState: 'queued',
    runtimeState: 'executing',
    executionMode,
    executionNodeCount: nodes.length,
    executionContext: {
      userId: context.userId ?? null,
      storeId: resolvedStoreId ?? null,
      missionType: pipeline?.type ?? context.missionType ?? null,
    },
  });

  await ensureMissionReadyForTopologyExecution(prisma, mid);

  if (executionMode !== 'campaign' && executionMode !== 'loyalty') {
    const metadata = await readMetadata(mid);
    return {
      ok: true,
      status: 'executing',
      missionId: mid,
      executionMode,
      nodeCount: nodes.length,
      metadata,
      message: 'Topology queued — campaign/loyalty mode node dispatch only in Phase 4',
    };
  }

  const executionContext = buildExecutionContext(pipelineMeta, {
    ...context,
    storeId: resolvedStoreId ?? undefined,
    missionId: mid,
    executionMode,
    missionType: pipeline?.type ?? context.missionType ?? null,
  });

  let nodeRun;
  try {
    nodeRun = await runTopologyNodes(mid, topology, executionContext);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Topology execution failed';
    await writeMetadata(mid, {
      multiAgentStatus: 'failed',
      executionState: 'failed',
      runtimeState: 'failed',
      executionFailureReason: 'TOPOLOGY_EXECUTION_ERROR',
      executionFailureMessage: message,
    });
    await finalizeMissionStatus(prisma, mid, 'failed', {
      progressTotalSteps: nodes.length,
      progressCompletedSteps: 0,
    });
    throw err;
  }

  const priorOutputs =
    pipeline?.outputsJson && typeof pipeline.outputsJson === 'object' && !Array.isArray(pipeline.outputsJson)
      ? pipeline.outputsJson
      : {};
  const outputsJson = { ...priorOutputs, ...nodeRun.outputs };
  let pipelineStatus = resolveLoyaltyPipelineStatus(executionMode, nodeRun);
  const artifactAuthority = resolveMissionArtifactAuthority({
    contract: missionContract,
    metadata: pipelineMeta,
    nodeRun,
    outputsJson,
  });
  if (nodeRun.status === 'completed' && artifactAuthority.satisfied !== true) {
    pipelineStatus = 'failed';
  }

  if (executionMode === 'loyalty' && pipelineStatus === 'failed' && nodeRun.status === 'completed') {
    await writeMetadata(mid, {
      multiAgentStatus: 'failed',
      executionState: 'failed',
      runtimeState: 'failed',
      executionFailureReason: 'LOYALTY_ARTIFACT_MISSING',
      executionFailureMessage:
        'Loyalty topology finished without a draft artifact. Retry or contact support.',
    });
  }
  if (pipelineStatus === 'failed' && nodeRun.status === 'completed' && artifactAuthority.satisfied !== true) {
    await writeMetadata(mid, {
      multiAgentStatus: 'failed',
      executionState: 'failed',
      runtimeState: 'failed',
      executionFailureReason: 'EXPECTED_ARTIFACT_MISSING',
      executionFailureMessage: `Mission completed its graph without expected artifact: ${
        artifactAuthority.expectedAssetTypes.join(', ') || 'unknown'
      }`,
      artifactAuthority,
    });
  }

  await finalizeMissionStatus(prisma, mid, pipelineStatus, {
    progressTotalSteps: nodes.length,
    progressCompletedSteps: nodeRun.completedCount + nodeRun.skippedCount,
    outputsJson,
  });

  // Keep metadata executionState as awaiting_owner_input when paused for owner fields.
  if (nodeRun.status === 'awaiting_owner_input') {
    await writeMetadata(mid, {
      executionState: 'awaiting_owner_input',
      multiAgentStatus: 'awaiting_owner_input',
      runtimeState: 'awaiting_owner_input',
      awaitingOwnerInput: true,
      missingFields: nodeRun.missingFields ?? [],
      pendingNodeId: nodeRun.pendingNodeId ?? null,
      completedNodes: nodeRun.completedNodes ?? [],
      executionCursor: nodeRun.executionCursor ?? nodeRun.pendingNodeId ?? null,
      suggestedQuestion: nodeRun.suggestedQuestion ?? null,
    });
  }

  const finalMetadata = await readMetadata(mid);

  return withCanonicalRuntimeState({
    ok: nodeRun.ok !== false,
    status: nodeRun.status,
    missionId: mid,
    executionMode,
    nodeCount: nodes.length,
    metadata: finalMetadata,
    nodeRun,
    multiAgentStatus: finalMetadata?.multiAgentStatus ?? null,
  });
}

/**
 * Merge owner answers into preseededDraft (generic field map).
 * @param {Record<string, unknown> | null | undefined} existing
 * @param {Record<string, unknown>} ownerInput
 */
function mergeOwnerInputIntoPreseeded(existing, ownerInput) {
  const base = existing && typeof existing === 'object' ? { ...existing } : {};
  const next = { ...base };
  for (const [key, value] of Object.entries(ownerInput)) {
    if (value == null) continue;
    if (key === 'stampThreshold' || key === 'requiredStamps') {
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) {
        next.requiredStamps = n;
        next.stampThreshold = n;
      }
      continue;
    }
    if (key === 'programName' && typeof value === 'string' && value.trim()) {
      next.programName = value.trim();
      next.name = value.trim();
      continue;
    }
    if (typeof value === 'string' && value.trim()) {
      next[key] = value.trim();
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      next[key] = value;
    } else if (value && typeof value === 'object') {
      next[key] = value;
    }
  }
  return next;
}

/**
 * Resume a topology paused on needs_input after the owner submits fields.
 *
 * @param {string} missionId
 * @param {Record<string, unknown>} ownerInput
 * @param {{ userId?: string; storeId?: string; missionType?: string }} [context]
 */
export async function resumeTopologyFromOwnerInput(missionId, ownerInput, context = {}) {
  const mid = String(missionId ?? '').trim();
  if (!mid) throw new Error('resumeTopologyFromOwnerInput requires missionId');
  const fields =
    ownerInput && typeof ownerInput === 'object' && !Array.isArray(ownerInput) ? ownerInput : null;
  if (!fields || !Object.keys(fields).length) {
    throw new Error('resumeTopologyFromOwnerInput requires ownerInput fields');
  }

  const metadata = await readMetadata(mid);
  const meta = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
  if (meta.awaitingOwnerInput !== true && String(meta.executionState ?? '') !== 'awaiting_owner_input') {
    throw new Error(`Mission ${mid} is not awaiting owner input`);
  }

  const cursorPending =
    meta.executionCursor &&
    typeof meta.executionCursor === 'object' &&
    typeof meta.executionCursor.pendingNodeId === 'string'
      ? String(meta.executionCursor.pendingNodeId).trim()
      : '';
  const pendingNodeId =
    (typeof meta.pendingNodeId === 'string' && meta.pendingNodeId.trim()) ||
    cursorPending ||
    (typeof meta.currentNodeId === 'string' && meta.currentNodeId.trim()) ||
    (typeof meta.currentTopologyNodeId === 'string' && meta.currentTopologyNodeId.trim()) ||
    null;
  if (!pendingNodeId) {
    throw new Error(`Mission ${mid} is missing pendingNodeId for owner-input resume`);
  }

  const topology = meta.approvedTopology ?? meta.pendingTopology;
  if (!topology || !Array.isArray(topology.nodes) || !topology.nodes.length) {
    throw new Error(`Mission ${mid} has no approved topology to resume`);
  }

  const priorOwner =
    meta.ownerInput && typeof meta.ownerInput === 'object' ? meta.ownerInput : {};
  const mergedOwnerInput = { ...priorOwner, ...fields };
  const mergedPreseeded = mergeOwnerInputIntoPreseeded(meta.preseededDraft, mergedOwnerInput);
  const attachmentRaw =
    meta.attachmentAnalysis && typeof meta.attachmentAnalysis === 'object'
      ? meta.attachmentAnalysis
      : meta.intentParameters?.attachmentAnalysis ?? null;

  const { executionDraft, missingFields: mergedMissing } = buildAndValidateExecutionDraft({
    attachmentAnalysis: attachmentRaw,
    preseededDraft: mergedPreseeded,
    ownerInput: mergedOwnerInput,
    runtimeUpdates: meta.executionDraft,
  });

  if (
    pickString(executionDraft.reward, executionDraft.rewardRule) &&
    (executionDraft.stampThreshold != null || executionDraft.requiredStamps != null) &&
    mergedMissing.length > 0
  ) {
    const err = new Error('STALE_MISSING_FIELDS: owner input merged but fields still missing');
    err.code = 'STALE_MISSING_FIELDS';
    throw err;
  }

  await writeMetadata(mid, {
    ownerInput: mergedOwnerInput,
    preseededDraft: executionDraft,
    executionDraft,
    awaitingOwnerInput: false,
    lastOwnerInputAt: new Date().toISOString(),
    missingFields: mergedMissing,
    executionCursor: {
      ...(meta.executionCursor && typeof meta.executionCursor === 'object' ? meta.executionCursor : {}),
      pendingNodeId,
      executionDraft,
    },
  });

  await emitTopologyBlackboardEvent(mid, 'owner_input_received', {
    pendingNodeId,
    fields: Object.keys(fields),
  });

  const prisma = getPrismaClient();
  const pipeline = await prisma.missionPipeline.findUnique({
    where: { id: mid },
    select: { type: true, metadataJson: true, outputsJson: true, targetId: true, targetType: true },
  });

  const pipelineMeta =
    pipeline?.metadataJson && typeof pipeline.metadataJson === 'object' && !Array.isArray(pipeline.metadataJson)
      ? pipeline.metadataJson
      : {};

  // Prefer freshly written metadata over stale pipeline JSON for draft/ownerInput.
  const executionMode =
    context.executionMode ??
    resolveTopologyExecutionMode(pipeline?.type ?? context.missionType, {
      ...pipelineMeta,
      ...meta,
      ownerInput: mergedOwnerInput,
      preseededDraft: executionDraft,
    });

  const resolvedStoreId =
    context.storeId ??
    (typeof meta.storeId === 'string' ? meta.storeId : null) ??
    (typeof pipelineMeta.storeId === 'string' ? pipelineMeta.storeId : null) ??
    (pipeline?.targetType === 'store' && pipeline?.targetId ? pipeline.targetId : null);

  await ensureMissionReadyForTopologyExecution(prisma, mid);

  const executionContext = buildExecutionContext(
    {
      ...pipelineMeta,
      ...meta,
      ownerInput: mergedOwnerInput,
      preseededDraft: executionDraft,
      executionDraft,
      attachmentAnalysis: attachmentRaw,
      storeId: resolvedStoreId,
    },
    {
      ...context,
      storeId: resolvedStoreId ?? undefined,
      missionId: mid,
      executionMode,
      missionType: pipeline?.type ?? context.missionType ?? null,
    },
  );
  executionContext.executionDraft = executionDraft;
  executionContext.attachmentAnalysisEvidence = attachmentAnalysisAsEvidence(attachmentRaw);

  const nodeRun = await runTopologyNodes(mid, topology, executionContext, {
    resumeFrom: pendingNodeId,
    priorNodeStatus: meta.topologyNodeStatus ?? null,
    priorNodeOutputs: meta.topologyNodeOutputs ?? null,
    priorToolOutputs: meta.topologyToolOutputs ?? null,
  });

  const priorOutputs =
    pipeline?.outputsJson && typeof pipeline.outputsJson === 'object' && !Array.isArray(pipeline.outputsJson)
      ? pipeline.outputsJson
      : {};
  const outputsJson = { ...priorOutputs, ...nodeRun.outputs };

  const pipelineStatus = resolveLoyaltyPipelineStatus(executionMode, nodeRun);

  if (executionMode === 'loyalty' && pipelineStatus === 'failed' && nodeRun.status === 'completed') {
    await writeMetadata(mid, {
      multiAgentStatus: 'failed',
      executionState: 'failed',
      executionFailureReason: 'LOYALTY_ARTIFACT_MISSING',
      executionFailureMessage:
        'Loyalty topology finished without a draft artifact. Retry or contact support.',
    });
  }

  await finalizeMissionStatus(prisma, mid, pipelineStatus, {
    progressTotalSteps: Array.isArray(topology.nodes) ? topology.nodes.length : 0,
    progressCompletedSteps: nodeRun.completedCount + nodeRun.skippedCount,
    outputsJson,
  });

  if (nodeRun.status === 'awaiting_owner_input') {
    await writeMetadata(mid, {
      executionState: 'awaiting_owner_input',
      multiAgentStatus: 'awaiting_owner_input',
      awaitingOwnerInput: true,
      missingFields: nodeRun.missingFields ?? [],
      pendingNodeId: nodeRun.pendingNodeId ?? null,
      completedNodes: nodeRun.completedNodes ?? [],
      executionCursor: nodeRun.executionCursor ?? nodeRun.pendingNodeId ?? null,
      suggestedQuestion: nodeRun.suggestedQuestion ?? null,
      ownerInput: mergedOwnerInput,
      preseededDraft: executionDraft,
      executionDraft,
    });
  }

  const finalMetadata = await readMetadata(mid);

  return {
    ok: nodeRun.ok !== false,
    status: nodeRun.status,
    missionId: mid,
    executionMode,
    nodeCount: Array.isArray(topology.nodes) ? topology.nodes.length : 0,
    metadata: finalMetadata,
    nodeRun,
  };
}
