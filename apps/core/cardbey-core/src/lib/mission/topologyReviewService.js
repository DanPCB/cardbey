/**
 * Topology review service — compile plans and handle HITL approve/reject/modify decisions.
 * Approval queues execution synchronously (<2s) and runs nodes asynchronously.
 */

import { generateExecutionPlan } from './generateExecutionPlan.js';
import {
  executeApprovedTopology,
  queueMissionForTopologyExecution,
  resolveTopologyExecutionMode,
} from './topologyExecutor.js';
import {
  markTopologyRejected,
  promotePendingToApproved,
  readMetadata,
  writeMetadata,
} from '../persistence/metadataWriter.js';
import { withCanonicalRuntimeState } from '../runtime/canonicalRuntimeState.js';
import { requireMissionPipelineAuthority } from './missionAuthority.js';
import { MissionTransitionError } from './missionTransitionError.js';
import { recordMissionAuthorityDiagnostic } from './missionAuthorityDiagnostics.js';
import { persistLoyaltyContractFromTopologyApproval } from '../loyalty/loyaltyContractApproval.js';

export { generateExecutionPlan };

const queuedExecutions = new Set();

/**
 * @param {string} missionId
 * @param {import('../artifact/types.ts').TopologyArtifact | Record<string, unknown>} topology
 * @param {Record<string, unknown>} context
 */
function scheduleTopologyExecution(missionId, topology, context) {
  const key = String(missionId);
  if (queuedExecutions.has(key)) return;
  queuedExecutions.add(key);

  setImmediate(() => {
    executeApprovedTopology(key, topology, context)
      .catch(async (err) => {
        const authority = await requireMissionPipelineAuthority(key).catch(() => ({ ok: false }));
        await recordMissionAuthorityDiagnostic(
          key,
          err instanceof MissionTransitionError
            ? err
            : new MissionTransitionError({
                code: 'TOPOLOGY_EXECUTION_FAILED',
                message: err instanceof Error ? err.message : String(err),
                missionId: key,
              }),
          authority.ok ? authority.authority : null,
        );
      })
      .finally(() => {
        queuedExecutions.delete(key);
      });
  });
}

/**
 * @param {Parameters<typeof generateExecutionPlan>[0]} intent
 * @param {Parameters<typeof generateExecutionPlan>[1]} storeId
 * @param {Parameters<typeof generateExecutionPlan>[2]} sessionId
 * @param {Parameters<typeof generateExecutionPlan>[3]} [options]
 */
export async function compileAndPersistExecutionPlan(intent, storeId, sessionId, options = {}) {
  return generateExecutionPlan(intent, storeId, sessionId, options);
}

/**
 * @param {string} missionId
 * @param {{
 *   decision: 'approve' | 'reject' | 'modify';
 *   reason?: string;
 *   topology?: unknown;
 *   policy?: unknown;
 *   reasoning?: unknown;
 *   modifications?: Record<string, unknown>;
 *   userId?: string;
 *   storeId?: string;
 *   requestId?: string;
 *   traceId?: string;
 * }} input
 */
export async function handleTopologyDecision(missionId, input) {
  const mid = String(missionId ?? '').trim();
  if (!mid) {
    return { ok: false, success: false, message: 'missionId is required' };
  }

  const decision = String(input?.decision ?? '').trim().toLowerCase();
  if (!['approve', 'reject', 'modify'].includes(decision)) {
    return { ok: false, success: false, message: 'decision must be approve, reject, or modify' };
  }

  const authorityResult = await requireMissionPipelineAuthority(mid);
  if (!authorityResult.ok) {
    return {
      ok: false,
      success: false,
      error: {
        code: authorityResult.code,
        message: authorityResult.message,
        missionId: mid,
        persistenceKind: authorityResult.authority?.persistenceKind ?? null,
      },
    };
  }

  const current = await readMetadata(mid);
  const meta = current && typeof current === 'object' && !Array.isArray(current) ? current : {};

  if (decision === 'reject') {
    const metadata = await markTopologyRejected(mid, input.reason ?? 'User rejected plan');
    return withCanonicalRuntimeState({
      ok: true,
      success: true,
      status: 'rejected',
      missionId: mid,
      metadata,
      message: 'Execution plan rejected',
    });
  }

  if (decision === 'modify') {
    const updates = {
      pendingTopology: input.topology ?? meta.pendingTopology,
      pendingPolicy: input.policy ?? meta.pendingPolicy,
      pendingReasoning: input.reasoning ?? meta.pendingReasoning,
      multiAgentStatus: 'pending_approval',
      approvalStatus: 'pending',
      modifiedAt: new Date().toISOString(),
      ...(input.modifications && typeof input.modifications === 'object' ? input.modifications : {}),
    };
    const metadata = await writeMetadata(mid, updates);
    return withCanonicalRuntimeState({
      ok: true,
      success: true,
      status: 'pending_approval',
      missionId: mid,
      metadata,
      message: 'Execution plan updated — awaiting approval',
      action: 'approval_required',
      multiAgentStatus: metadata.multiAgentStatus ?? 'pending_approval',
    });
  }

  if (!meta.pendingTopology && !meta.approvedTopology && !input.topology) {
    return { ok: false, success: false, message: 'No pending topology to approve' };
  }

  let metadata = await promotePendingToApproved(mid, {
    topology: input.topology,
    policy: input.policy,
    reasoning: input.reasoning,
  });

  await writeMetadata(mid, {
    topologyDecisionEvent: {
      decision: 'approve',
      at: new Date().toISOString(),
      userId: input.userId ?? null,
      requestId: input.requestId ?? null,
      traceId: input.traceId ?? null,
    },
  });

  const pipeline = authorityResult.authority.record;
  const pipelineMeta =
    pipeline?.metadataJson && typeof pipeline.metadataJson === 'object' && !Array.isArray(pipeline.metadataJson)
      ? pipeline.metadataJson
      : meta;

  const resolvedStoreId =
    (typeof input.storeId === 'string' && input.storeId.trim()) ||
    (typeof pipelineMeta.storeId === 'string' && pipelineMeta.storeId.trim()) ||
    (pipeline?.targetType === 'store' && typeof pipeline?.targetId === 'string' ? pipeline.targetId : null) ||
    undefined;

  const executionMode = resolveTopologyExecutionMode(pipeline?.type ?? null, {
    ...pipelineMeta,
    ...metadata,
  });

  let creationContract = metadata.creationContract ?? null;
  if (executionMode === 'loyalty') {
    const contractResult = await persistLoyaltyContractFromTopologyApproval(mid, {
      ...pipelineMeta,
      ...metadata,
    }, {
      storeId: resolvedStoreId,
      userMessage: pipelineMeta.goal,
    });
    if (!contractResult.ok) {
      await recordMissionAuthorityDiagnostic(
        mid,
        new MissionTransitionError({
          code: contractResult.code,
          message: contractResult.message,
          missionId: mid,
        }),
        authorityResult.authority,
        { requestId: input.requestId, traceId: input.traceId },
      );
      return {
        ok: false,
        success: false,
        error: {
          code: contractResult.code,
          message: contractResult.message,
          missionId: mid,
          missingFields: contractResult.missingFields,
        },
        contract: contractResult.contract ?? null,
      };
    }
    creationContract = contractResult.contract;
    metadata = contractResult.metadata ?? metadata;
  }

  let queuedState;
  try {
    queuedState = await queueMissionForTopologyExecution(mid);
  } catch (err) {
    const diagnostic = await recordMissionAuthorityDiagnostic(
      mid,
      err instanceof MissionTransitionError
        ? err
        : new MissionTransitionError({
            code: 'MISSION_RECORD_NOT_FOUND',
            message: err instanceof Error ? err.message : String(err),
            missionId: mid,
          }),
      authorityResult.authority,
      { requestId: input.requestId, traceId: input.traceId },
    );
    if (err instanceof MissionTransitionError) {
      return { ...err.toJSON(), diagnostic };
    }
    throw err;
  }

  const topologyToRun = metadata.approvedTopology ?? meta.approvedTopology ?? meta.pendingTopology;
  scheduleTopologyExecution(mid, topologyToRun, {
    userId: typeof input.userId === 'string' ? input.userId : undefined,
    storeId: resolvedStoreId,
    executionMode,
  });

  return withCanonicalRuntimeState({
    ok: true,
    success: true,
    accepted: true,
    approved: true,
    status: queuedState,
    state: queuedState,
    missionId: mid,
    executionMode,
    creationContract,
    message: 'Execution plan approved — queued for execution',
    action: 'topology_execution_queued',
    multiAgentStatus: 'approved',
  });
}

/**
 * @param {string} missionId
 */
export async function getTopologyReviewState(missionId) {
  const metadata = await readMetadata(missionId);
  const meta = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};

  return {
    missionId,
    multiAgentStatus: meta.multiAgentStatus ?? null,
    approvalStatus: meta.approvalStatus ?? null,
    runtimeState: meta.runtimeState ?? meta.executionState ?? null,
    missionContract: meta.missionContract ?? null,
    spineOwnership: meta.spineOwnership ?? null,
    pendingTopology: meta.pendingTopology ?? null,
    pendingPolicy: meta.pendingPolicy ?? null,
    pendingReasoning: meta.pendingReasoning ?? null,
    approvedTopology: meta.approvedTopology ?? null,
    approvedPolicy: meta.approvedPolicy ?? null,
    approvedReasoning: meta.approvedReasoning ?? null,
    creationContract: meta.creationContract ?? null,
    missionAuthorityDiagnostic: meta.missionAuthorityDiagnostic ?? null,
  };
}
