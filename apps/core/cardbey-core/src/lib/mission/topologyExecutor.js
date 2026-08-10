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
  requiresTopologyOwnerReview,
} from './topologyExecutionDraft.js';
import { readMissionContract, advanceFrozenMissionContractTopology } from '../kernel/missionContract.js';
import {
  buildTopologyLifecycleTrace,
  resolveTopologyExecutionOutcome,
} from './topologyExecutionOutcome.js';
import {
  asMissionEvidenceGraph,
  mergeMissionEvidenceGraphs,
  summarizeMissionEvidenceGraph,
} from './missionEvidenceGraph.js';
import {
  buildLoyaltyMissionEvidenceGraph,
  recordLoyaltyMissionOutcomeEvidence,
} from './loyaltyMissionEvidence.js';
import {
  normalizeToUnifiedGraph,
  persistGraph,
  seedMissionGraphFromLoyaltyMetadata,
  setGraphPhase,
  loadLoyaltyEvidenceContext,
  syncLoyaltyStageToGraph,
} from '../evidence/missionEvidenceGraphService.js';
import { runReasoningStep } from '../reasoning/reasoningCoordinator.js';
import {
  isLoyaltyCardMission,
  shouldSkipDagAfterReasoning,
  writeReasoningPrimaryExecutionMetadata,
} from '../reasoning/reasoningPrimaryExecution.js';
import { Features } from '../../config/features.js';
import { withCanonicalRuntimeState } from '../runtime/canonicalRuntimeState.js';
import { mergeOwnerTopologyIntoDraft } from '../documentTopology/documentTopologyOwnerInput.js';
import { hasAuthoritativeLoyaltyTopology } from '../loyalty/loyaltyContractDiagnostics.js';
import {
  applyOwnerActionToCreationContract,
  loyaltyCreationContractToDraft,
} from '../loyalty/loyaltyCreationContract.js';
import { MissionTransitionError } from './missionTransitionError.js';
import { requireMissionPipelineAuthority } from './missionAuthority.js';
import { emitTopologyBlackboardEvent } from './topologyExecutionTelemetry.js';

/** @typedef {'campaign' | 'store' | 'loyalty' | 'generic'} TopologyExecutionMode */

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
  const hasTopologyNodes = (value) =>
    Boolean(
      value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        Array.isArray(value.nodes) &&
        value.nodes.length > 0,
    );
  // After promote, pendingTopology is cleared; approvedTopology is the reopen source.
  if (!hasTopologyNodes(meta.pendingTopology) && !hasTopologyNodes(meta.approvedTopology)) {
    return false;
  }

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
 * @param {{ persistenceKind?: string }} [ctx]
 */
async function transitionMissionStatus(prisma, missionId, fromStatus, toStatus, extra = {}, ctx = {}) {
  if (!canTransitionMissionPipeline(fromStatus, toStatus)) {
    throw new MissionTransitionError({
      code: 'INVALID_MISSION_STATE',
      message: `Cannot transition mission ${missionId} from ${fromStatus} to ${toStatus}`,
      missionId,
      currentState: fromStatus,
      requiredState: fromStatus,
      failedTransition: `${fromStatus} -> ${toStatus}`,
      persistenceKind: ctx.persistenceKind ?? 'mission_pipeline',
    });
  }

  try {
    const result = await safePipelineUpdate(
      prisma,
      {
        where: { id: missionId, status: fromStatus },
        data: { status: toStatus, ...extra },
      },
      { label: `topologyExecutor.${fromStatus}_to_${toStatus}`, missionId },
    );
    if (!result) {
      throw new MissionTransitionError({
        code: 'MISSION_RECORD_NOT_FOUND',
        message: 'Authoritative mission record not found.',
        missionId,
        currentState: fromStatus,
        failedTransition: `${fromStatus} -> ${toStatus}`,
        persistenceKind: ctx.persistenceKind ?? 'mission_pipeline',
      });
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[topologyExecutor] transition: ${fromStatus} -> ${toStatus} mission=${missionId}`);
    }
    return result;
  } catch (err) {
    if (err instanceof MissionTransitionError) throw err;
    if (err?.code === 'P2025') {
      throw new MissionTransitionError({
        code: 'MISSION_RECORD_NOT_FOUND',
        message: 'Authoritative mission record not found.',
        missionId,
        currentState: fromStatus,
        failedTransition: `${fromStatus} -> ${toStatus}`,
        persistenceKind: ctx.persistenceKind ?? 'mission_pipeline',
        cause: err,
      });
    }
    throw err;
  }
}

/**
 * Advance mission through valid pipeline transitions before topology execution.
 *
 * @param {import('../lib/prisma.js').PrismaClient} prisma
 * @param {string} missionId
 */
export async function ensureMissionReadyForTopologyExecution(prisma, missionId, ctx = {}) {
  const row = await prisma.missionPipeline.findUnique({
    where: { id: missionId },
    select: { status: true },
  });
  if (!row) {
    throw new MissionTransitionError({
      code: 'MISSION_RECORD_NOT_FOUND',
      message: `MissionPipeline not found: ${missionId}`,
      missionId,
      persistenceKind: ctx.persistenceKind ?? 'mission_pipeline',
    });
  }

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
    await transitionMissionStatus(prisma, missionId, 'awaiting_confirmation', 'queued', {}, ctx);
    status = 'queued';
  }

  if (status === 'awaiting_owner_input') {
    await transitionMissionStatus(prisma, missionId, 'awaiting_owner_input', 'executing', {
      runState: 'running',
      startedAt: new Date(),
    }, ctx);
    return 'executing';
  }

  if (status === 'queued') {
    await transitionMissionStatus(prisma, missionId, 'queued', 'executing', {
      runState: 'running',
      startedAt: new Date(),
    }, ctx);
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
    await transitionMissionStatus(prisma, missionId, 'failed', 'queued', {}, ctx);
    await transitionMissionStatus(prisma, missionId, 'queued', 'executing', {
      runState: 'running',
      startedAt: new Date(),
    }, ctx);
    return 'executing';
  }

  throw new MissionTransitionError({
    code: 'INVALID_MISSION_STATE',
    message: `Mission ${missionId} is ${status}; cannot start topology execution`,
    missionId,
    currentState: status,
    requiredState: 'queued',
    persistenceKind: ctx.persistenceKind ?? 'mission_pipeline',
  });
}

/**
 * Fast synchronous queue — awaiting_confirmation → queued only.
 * @param {string} missionId
 */
export async function queueMissionForTopologyExecution(missionId) {
  const authorityResult = await requireMissionPipelineAuthority(missionId);
  if (!authorityResult.ok) {
    throw new MissionTransitionError({
      code: authorityResult.code,
      message: authorityResult.message,
      missionId,
      persistenceKind: authorityResult.authority?.persistenceKind ?? null,
    });
  }

  const prisma = getPrismaClient();
  const { authority } = authorityResult;
  let status = String(authority.currentState ?? '').trim();

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
        { label: 'topologyExecutor.reopen_completed_for_queue', missionId },
      );
      status = 'awaiting_confirmation';
    }
  }

  if (status === 'awaiting_confirmation') {
    await transitionMissionStatus(prisma, missionId, 'awaiting_confirmation', 'queued', {}, {
      persistenceKind: authority.persistenceKind,
    });
    return 'queued';
  }

  if (status === 'queued' || status === 'executing' || status === 'awaiting_owner_input') {
    return status;
  }

  if (status === 'failed') {
    await transitionMissionStatus(prisma, missionId, 'failed', 'queued', {}, {
      persistenceKind: authority.persistenceKind,
    });
    return 'queued';
  }

  throw new MissionTransitionError({
    code: 'INVALID_MISSION_STATE',
    message: `Mission ${missionId} is ${status}; cannot queue topology execution`,
    missionId,
    currentState: status,
    requiredState: 'awaiting_confirmation',
    persistenceKind: authority.persistenceKind,
  });
}

/**
 * @param {import('../lib/prisma.js').PrismaClient} prisma
 * @param {string} missionId
 * @param {'completed' | 'failed' | 'awaiting_owner_input'} finalStatus
 * @param {Record<string, unknown>} extra
 * @param {{ failureReason?: string; failureMessage?: string; reconciled?: boolean }} [ctx]
 */
async function finalizeMissionStatus(prisma, missionId, finalStatus, extra = {}, ctx = {}) {
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
    ...(finalStatus === 'completed'
      ? {
          multiAgentStatus: 'completed',
          executionFailureReason: null,
          executionFailureMessage: null,
        }
      : finalStatus === 'failed'
        ? {
            multiAgentStatus: 'failed',
            ...(ctx.failureReason ? { executionFailureReason: ctx.failureReason } : {}),
            ...(ctx.failureMessage ? { executionFailureMessage: ctx.failureMessage } : {}),
          }
        : {}),
    ...(ctx.reconciled
      ? {
          missionOutcomeReconciled: {
            previousStatus: 'failed',
            newStatus: 'completed',
            reason: 'required outputs were completed before false terminal transition',
            at: new Date().toISOString(),
          },
        }
      : {}),
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

  const authorityResult = await requireMissionPipelineAuthority(mid);
  if (!authorityResult.ok) {
    throw new MissionTransitionError({
      code: authorityResult.code,
      message: authorityResult.message,
      missionId: mid,
      persistenceKind: authorityResult.authority?.persistenceKind ?? null,
    });
  }

  const nodes = Array.isArray(topology?.nodes) ? topology.nodes : [];
  if (!nodes.length) {
    throw new Error('topologyExecutor requires approved topology with nodes');
  }

  const prisma = getPrismaClient();
  const pipeline = await prisma.missionPipeline.findUnique({
    where: { id: mid },
    select: { type: true, metadataJson: true, outputsJson: true, targetId: true, targetType: true, status: true },
  });

  if (!pipeline) {
    throw new MissionTransitionError({
      code: 'MISSION_RECORD_NOT_FOUND',
      message: 'Authoritative mission record not found.',
      missionId: mid,
      persistenceKind: authorityResult.authority.persistenceKind,
    });
  }

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

  await ensureMissionReadyForTopologyExecution(prisma, mid, {
    persistenceKind: authorityResult.authority.persistenceKind,
  });

  await writeMetadata(mid, {
    multiAgentStatus: 'executing',
    approvalStatus: 'approved',
    executionStartedAt: new Date().toISOString(),
    executionState: 'executing',
    runtimeState: 'executing',
    executionMode,
    executionNodeCount: nodes.length,
    executionContext: {
      userId: context.userId ?? null,
      storeId: resolvedStoreId ?? null,
      missionType: pipeline?.type ?? context.missionType ?? null,
    },
  });

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

  if (Features.phase2.activeReasoning && executionMode === 'loyalty') {
    try {
      await seedMissionGraphFromLoyaltyMetadata(mid, {
        ...pipelineMeta,
        attachmentAnalysis: executionContext.attachmentAnalysis ?? null,
        preseededDraft: executionContext.preseededDraft ?? null,
        intakeEvidence: pipelineMeta.intakeEvidence ?? null,
      });
    } catch (seedErr) {
      console.warn(
        '[topologyExecutor] seedMissionGraphFromLoyaltyMetadata failed (non-fatal):',
        seedErr instanceof Error ? seedErr.message : seedErr,
      );
    }
    try {
      const reasoningResult = await runReasoningStep(mid, {
        ...executionContext,
        userId: context.userId ?? null,
        storeId: resolvedStoreId ?? null,
        approvedTopology: topology,
        metadata: pipelineMeta,
        missionType: pipeline?.type ?? context.missionType ?? null,
      });
      if (reasoningResult?.deferTopology === false && reasoningResult?.actionResult?.status === 'needs_input') {
        await writeMetadata(mid, {
          executionState: 'awaiting_owner_input',
          multiAgentStatus: 'awaiting_owner_input',
          awaitingOwnerInput: true,
          missingFields: reasoningResult.actionResult.missingFields ?? [],
          suggestedQuestion: reasoningResult.actionResult.suggestedQuestion ?? null,
        });
        return {
          ok: true,
          status: 'awaiting_owner_input',
          missionId: mid,
          executionMode,
          reasoning: reasoningResult,
        };
      }
      if (
        isLoyaltyCardMission(pipeline?.type ?? context.missionType, pipelineMeta) &&
        shouldSkipDagAfterReasoning(reasoningResult)
      ) {
        const pipelineStatus =
          reasoningResult.actionResult?.status === 'needs_input'
            ? 'awaiting_owner_input'
            : reasoningResult.terminalOutcome?.status === 'failed'
              ? 'failed'
              : 'completed';
        await writeReasoningPrimaryExecutionMetadata(mid, reasoningResult, {
          pipelineStatus,
          multiAgentStatus: pipelineStatus,
          executionState: pipelineStatus,
        });
        if (Features.phase1.graphWriteTarget && reasoningResult.graph) {
          const unifiedGraph = normalizeToUnifiedGraph(reasoningResult.graph);
          if (reasoningResult.terminalOutcome) {
            unifiedGraph.outcome = reasoningResult.terminalOutcome;
          }
          setGraphPhase(
            unifiedGraph,
            pipelineStatus === 'completed' ? 'terminal' : 'verify',
          );
          await persistGraph(unifiedGraph, { missionId: mid });
        }
        await finalizeMissionStatus(prisma, mid, pipelineStatus, {
          progressTotalSteps: nodes.length,
          progressCompletedSteps: nodes.length,
        });
        const finalMetadata = await readMetadata(mid);
        if (Features.phase2.reasoningStepLog && process.env.NODE_ENV !== 'production') {
          console.info('[topologyExecutor] reasoning_primary_skipped_dag', {
            missionId: mid,
            pipelineStatus,
            capabilityId: reasoningResult.actionResult?.capabilityId ?? null,
          });
        }
        return withCanonicalRuntimeState({
          ok: pipelineStatus !== 'failed',
          status: pipelineStatus,
          missionId: mid,
          executionMode,
          nodeCount: nodes.length,
          metadata: finalMetadata,
          reasoning: reasoningResult,
          skippedDag: true,
          multiAgentStatus: finalMetadata?.multiAgentStatus ?? pipelineStatus,
        });
      }
      if (Features.phase2.reasoningStepLog && process.env.NODE_ENV !== 'production') {
        console.info('[topologyExecutor] reasoning_step_before_dag', {
          missionId: mid,
          deferTopology: reasoningResult?.deferTopology,
          capabilityId: reasoningResult?.nextPlan?.capabilityId ?? null,
          phase: reasoningResult?.graph?.phase,
          reasoningPrimary: reasoningResult?.reasoningPrimary === true,
        });
      }
    } catch (reasoningErr) {
      console.warn(
        '[topologyExecutor] runReasoningStep failed (non-fatal):',
        reasoningErr instanceof Error ? reasoningErr.message : reasoningErr,
      );
    }
  }

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
  const freshMetadata = await readMetadata(mid);
  const priorGraph = asMissionEvidenceGraph(
    freshMetadata?.missionEvidenceGraph ?? pipelineMeta.missionEvidenceGraph ?? null,
  );
  const executionOutcome = resolveTopologyExecutionOutcome({
    nodeRun,
    missionContract,
    topology,
    metadata: {
      ...pipelineMeta,
      ...(freshMetadata && typeof freshMetadata === 'object' ? freshMetadata : {}),
    },
    outputsJson,
    missionFamily: missionContract?.missionFamily ?? pipelineMeta.compilerTool ?? 'generic',
    evidenceGraph: priorGraph,
  });
  const pipelineStatus = executionOutcome.pipelineStatus;
  const terminalPatch = executionOutcome.terminalOutcome
    ? {
        terminalMissionOutcome: executionOutcome.terminalOutcome,
        missionExecutionOutcome: executionOutcome.missionOutcome,
      }
    : { missionExecutionOutcome: executionOutcome.missionOutcome };

  if (pipelineStatus === 'failed' && nodeRun.status === 'completed') {
    await writeMetadata(mid, {
      multiAgentStatus: 'failed',
      executionState: 'failed',
      runtimeState: 'failed',
      executionFailureReason: executionOutcome.failureReason ?? 'TOPOLOGY_EXECUTION_FAILED',
      executionFailureMessage:
        executionOutcome.failureMessage ?? 'Topology execution did not satisfy completion criteria.',
      artifactAuthority: executionOutcome.artifactAuthority,
      ...terminalPatch,
    });
  } else if (pipelineStatus === 'completed') {
    await writeMetadata(mid, {
      multiAgentStatus: 'completed',
      executionState: 'completed',
      runtimeState: 'completed',
      phase: executionOutcome.missionOutcome?.artifacts?.length ? 'awaiting_owner_review' : undefined,
      ...terminalPatch,
      ...(executionOutcome.warnings?.length
        ? { missionExecutionWarnings: executionOutcome.warnings }
        : {}),
      ...(executionOutcome.reconciled
        ? {
            missionOutcomeReconciled: {
              previousStatus: 'failed',
              newStatus: 'completed',
              reason: 'required outputs were completed before false terminal transition',
              at: new Date().toISOString(),
            },
          }
        : {}),
    });
  }

  const lifecycleTrace = buildTopologyLifecycleTrace({
    traceId: pipelineMeta.traceId ?? freshMetadata?.traceId ?? null,
    missionId: mid,
    topologyId: topology?.id ?? null,
    resultStatus: nodeRun.status,
    artifactIds: (executionOutcome.missionOutcome?.artifacts ?? [])
      .map((row) => row?.id)
      .filter(Boolean),
    persistedRecordIds: (executionOutcome.missionOutcome?.persistedEntities ?? [])
      .map((row) => row?.id)
      .filter(Boolean),
    terminalSignal: `topology.execution.${pipelineStatus === 'completed' ? 'succeeded' : pipelineStatus}`,
    previousMissionStatus: String(pipeline?.status ?? 'executing'),
    nextMissionStatus: pipelineStatus,
    failureCode: executionOutcome.failureReason ?? null,
    failureSource: pipelineStatus === 'failed' ? 'topologyExecutor.finalize' : null,
    errorPresent: pipelineStatus === 'failed',
    reconciled: executionOutcome.reconciled === true,
    warnings: executionOutcome.warnings ?? [],
    outcomeStatus: executionOutcome.missionOutcome?.status ?? null,
  });
  if (process.env.NODE_ENV !== 'production') {
    console.log('[topologyExecutor] lifecycle_trace', JSON.stringify(lifecycleTrace));
  }

  if (executionMode === 'loyalty') {
    const priorGraph = asMissionEvidenceGraph(
      freshMetadata?.missionEvidenceGraph ??
        pipelineMeta.missionEvidenceGraph ??
        null,
    );
    const draftForEvidence =
      freshMetadata?.loyaltyProgramDraftArtifact ??
      freshMetadata?.preseededDraft ??
      nodeRun.outputs?.loyaltyProgramDraftArtifact ??
      null;
    let evidenceGraph = priorGraph
      ? mergeMissionEvidenceGraphs(
          priorGraph,
          buildLoyaltyMissionEvidenceGraph({
            missionId: mid,
            evidenceId: pickString(freshMetadata?.evidenceId, pipelineMeta.evidenceId),
            preseededDraft:
              draftForEvidence && typeof draftForEvidence === 'object' ? draftForEvidence : null,
            priorGraph,
          }),
        )
      : buildLoyaltyMissionEvidenceGraph({
          missionId: mid,
          evidenceId: pickString(freshMetadata?.evidenceId, pipelineMeta.evidenceId),
          preseededDraft:
            draftForEvidence && typeof draftForEvidence === 'object' ? draftForEvidence : null,
        });
    evidenceGraph = recordLoyaltyMissionOutcomeEvidence(evidenceGraph, {
      status:
        pipelineStatus === 'completed'
          ? 'completed'
          : pipelineStatus === 'awaiting_owner_input'
            ? 'blocked'
            : 'failed',
      missionId: mid,
      artifactIds: (executionOutcome.missionOutcome?.artifacts ?? [])
        .map((row) => row?.id)
        .filter(Boolean),
      failureCode: executionOutcome.failureReason ?? null,
      reconciled: executionOutcome.reconciled === true,
    });
    const unifiedGraph = normalizeToUnifiedGraph(evidenceGraph);
    if (executionOutcome.terminalOutcome) {
      unifiedGraph.outcome = executionOutcome.terminalOutcome;
    }
    setGraphPhase(
      unifiedGraph,
      pipelineStatus === 'completed' ? 'terminal' : pipelineStatus === 'awaiting_owner_input' ? 'verify' : 'verify',
    );
    if (Features.phase1.graphWriteTarget) {
      await persistGraph(unifiedGraph, { missionId: mid });
    } else {
      await writeMetadata(mid, {
        missionEvidenceGraph: unifiedGraph,
        missionEvidenceSummary: summarizeMissionEvidenceGraph(unifiedGraph),
      });
    }
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
function normalizeCreationReviewAction(ownerInput) {
  const raw = String(
    ownerInput?.topologyAction ?? ownerInput?.loyaltyCreationAction ?? '',
  )
    .trim()
    .toUpperCase();
  if (!raw) return null;
  if (raw === 'SIMPLIFIED') return 'USE_SIMPLIFIED';
  return raw;
}

function mergeOwnerInputIntoPreseeded(existing, ownerInput, ctx = {}) {
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
    if (
      key === 'topologyAction' ||
      key === 'loyaltyCreationAction' ||
      key === 'cardTopology' ||
      key === 'selectedRecommendationId' ||
      key === 'recommendationId'
    ) {
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

  const topologyMerged = mergeOwnerTopologyIntoDraft(next, ownerInput, ctx);
  const action = normalizeCreationReviewAction(ownerInput);
  const contract =
    topologyMerged.creationContract && typeof topologyMerged.creationContract === 'object'
      ? topologyMerged.creationContract
      : null;

  if (!contract || !action) return topologyMerged;

  const updatedContract = applyOwnerActionToCreationContract(contract, action, {
    rule:
      ownerInput.rule && typeof ownerInput.rule === 'object'
        ? ownerInput.rule
        : topologyMerged.rule,
    cardTopology:
      topologyMerged.cardTopology && typeof topologyMerged.cardTopology === 'object'
        ? topologyMerged.cardTopology
        : ownerInput.cardTopology && typeof ownerInput.cardTopology === 'object'
          ? ownerInput.cardTopology
          : null,
    recommendationId: pickString(ownerInput.selectedRecommendationId, ownerInput.recommendationId),
  });

  const flattened = loyaltyCreationContractToDraft(updatedContract);
  return {
    ...topologyMerged,
    ...flattened,
    creationContract: updatedContract,
    evidence: topologyMerged.evidence ?? flattened.evidence,
    ownerInstructions: topologyMerged.ownerInstructions ?? flattened.ownerInstructions,
  };
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
  let preseedBase = meta.preseededDraft;
  if (Features.phase1.graphWriteTarget) {
    try {
      const graphCtx = await loadLoyaltyEvidenceContext(mid);
      if (graphCtx?.preseededDraft) preseedBase = graphCtx.preseededDraft;
    } catch {
      /* graph read is best-effort */
    }
  }
  const mergedPreseeded = mergeOwnerInputIntoPreseeded(preseedBase, mergedOwnerInput, {
    missionId: mid,
    userId: context.userId ?? null,
  });
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

  const staleMissing = mergedMissing.filter((field) => {
    if (field === 'topology_review' && !requiresTopologyOwnerReview(executionDraft)) return false;
    return true;
  });
  if (
    pickString(executionDraft.reward, executionDraft.rewardRule) &&
    (executionDraft.stampThreshold != null || executionDraft.requiredStamps != null) &&
    staleMissing.length > 0
  ) {
    const err = new Error('STALE_MISSING_FIELDS: owner input merged but fields still missing');
    err.code = 'STALE_MISSING_FIELDS';
    throw err;
  }

  if (Features.phase1.graphWriteTarget) {
    try {
      const syncedGraph = await syncLoyaltyStageToGraph(mid, {
        preseededDraft: executionDraft,
        stage: 'topology.owner_input_resume',
      });
      const approvedTopology =
        syncedGraph?.topology ??
        (hasAuthoritativeLoyaltyTopology(executionDraft.cardTopology)
          ? executionDraft.cardTopology
          : null);
      if (approvedTopology) {
        await advanceFrozenMissionContractTopology(mid, approvedTopology, {
          evidenceGraphId: syncedGraph?.graphId ?? null,
          evidenceGraphVersion: syncedGraph?.version ?? null,
        });
      }
    } catch {
      /* graph sync is best-effort */
    }
  } else if (hasAuthoritativeLoyaltyTopology(executionDraft.cardTopology)) {
    try {
      await advanceFrozenMissionContractTopology(mid, executionDraft.cardTopology);
    } catch {
      /* contract rebaseline is best-effort */
    }
  }

  await writeMetadata(mid, {
    ownerInput: mergedOwnerInput,
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
  const freshMetadata = await readMetadata(mid);
  const missionContract = await readMissionContract(mid);
  const priorGraph = asMissionEvidenceGraph(
    freshMetadata?.missionEvidenceGraph ?? pipelineMeta.missionEvidenceGraph ?? meta.missionEvidenceGraph ?? null,
  );
  const executionOutcome = resolveTopologyExecutionOutcome({
    nodeRun,
    missionContract,
    topology,
    metadata: {
      ...pipelineMeta,
      ...meta,
      ...(freshMetadata && typeof freshMetadata === 'object' ? freshMetadata : {}),
    },
    outputsJson,
    missionFamily: missionContract?.missionFamily ?? 'generic',
    evidenceGraph: priorGraph,
  });
  const pipelineStatus = executionOutcome.pipelineStatus;
  const terminalPatch = executionOutcome.terminalOutcome
    ? {
        terminalMissionOutcome: executionOutcome.terminalOutcome,
        missionExecutionOutcome: executionOutcome.missionOutcome,
      }
    : { missionExecutionOutcome: executionOutcome.missionOutcome };

  if (pipelineStatus === 'failed' && nodeRun.status === 'completed') {
    await writeMetadata(mid, {
      multiAgentStatus: 'failed',
      executionState: 'failed',
      executionFailureReason: executionOutcome.failureReason ?? 'TOPOLOGY_EXECUTION_FAILED',
      executionFailureMessage:
        executionOutcome.failureMessage ?? 'Topology execution did not satisfy completion criteria.',
      ...terminalPatch,
    });
  } else if (pipelineStatus === 'completed') {
    await writeMetadata(mid, {
      multiAgentStatus: 'completed',
      executionState: 'completed',
      runtimeState: 'completed',
      ...terminalPatch,
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
