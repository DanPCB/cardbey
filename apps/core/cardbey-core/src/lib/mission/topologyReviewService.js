/**
 * Topology review service — compile plans and handle HITL approve/reject/modify decisions.
 * Approval triggers topologyExecutor node dispatch (Phase 4).
 */

import { generateExecutionPlan } from './generateExecutionPlan.js';
import { executeApprovedTopology } from './topologyExecutor.js';
import {
  markTopologyRejected,
  promotePendingToApproved,
  readMetadata,
  writeMetadata,
} from '../persistence/metadataWriter.js';
import { withCanonicalRuntimeState } from '../runtime/canonicalRuntimeState.js';

export { generateExecutionPlan };

/**
 * Compile intent, persist pending artifacts, return UI-ready payload.
 *
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
 * }} input
 */
export async function handleTopologyDecision(missionId, input) {
  const mid = String(missionId ?? '').trim();
  if (!mid) {
    return { ok: false, message: 'missionId is required' };
  }

  const decision = String(input?.decision ?? '').trim().toLowerCase();
  if (!['approve', 'reject', 'modify'].includes(decision)) {
    return { ok: false, message: 'decision must be approve, reject, or modify' };
  }

  const current = await readMetadata(mid);
  const meta = current && typeof current === 'object' && !Array.isArray(current) ? current : {};

  if (decision === 'reject') {
    const metadata = await markTopologyRejected(mid, input.reason ?? 'User rejected plan');
    return withCanonicalRuntimeState({
      ok: true,
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
      status: 'pending_approval',
      missionId: mid,
      metadata,
      message: 'Execution plan updated — awaiting approval',
      action: 'approval_required',
      multiAgentStatus: metadata.multiAgentStatus ?? 'pending_approval',
    });
  }

  // approve
  if (!meta.pendingTopology && !meta.approvedTopology && !input.topology) {
    return { ok: false, message: 'No pending topology to approve' };
  }

  const metadata = await promotePendingToApproved(mid, {
    topology: input.topology,
    policy: input.policy,
    reasoning: input.reasoning,
  });

  const prisma = (await import('../prisma.js')).getPrismaClient();
  const pipeline = await prisma.missionPipeline.findUnique({
    where: { id: mid },
    select: { targetId: true, targetType: true, metadataJson: true },
  });
  const pipelineMeta =
    pipeline?.metadataJson && typeof pipeline.metadataJson === 'object' && !Array.isArray(pipeline.metadataJson)
      ? pipeline.metadataJson
      : {};
  const resolvedStoreId =
    (typeof input.storeId === 'string' && input.storeId.trim()) ||
    (typeof pipelineMeta.storeId === 'string' && pipelineMeta.storeId.trim()) ||
    (pipeline?.targetType === 'store' && typeof pipeline?.targetId === 'string' ? pipeline.targetId : null) ||
    undefined;

  const topologyToRun = metadata.approvedTopology ?? meta.approvedTopology ?? meta.pendingTopology;
  const execution = await executeApprovedTopology(mid, topologyToRun, {
    userId: typeof input.userId === 'string' ? input.userId : undefined,
    storeId: resolvedStoreId,
  });

  const executionStatus = execution.status ?? 'executing';
  const nodeRun = execution.nodeRun ?? null;
  const nodes = Array.isArray(topologyToRun?.nodes) ? topologyToRun.nodes : [];

  let failureSummary = null;
  if (executionStatus === 'failed') {
    const { buildTopologyFailureSummary } = await import('./topologyExecutionTelemetry.js');
    failureSummary = buildTopologyFailureSummary(nodeRun ?? execution, nodes);
  }

  const failedMessage = failureSummary?.detail
    ? `Execution plan approved — ${failureSummary.detail}`
    : 'Execution plan approved — topology execution failed';

  const missingFields = Array.isArray(nodeRun?.missingFields)
    ? nodeRun.missingFields
    : Array.isArray(execution.metadata?.missingFields)
      ? execution.metadata.missingFields
      : [];

  const awaitingMessage =
    missingFields.length > 0
      ? `I need one more detail before creating the loyalty program: What reward should customers receive after completing the card? (Missing: ${missingFields.join(', ')})`
      : 'I need one more detail before creating the loyalty program: What reward should customers receive after completing the card?';

  return withCanonicalRuntimeState({
    // Plan was approved; execution failure / owner-input pause are soft results (HTTP 200).
    ok: true,
    approved: true,
    status: executionStatus,
    missionId: mid,
    executionMode: execution.executionMode ?? 'generic',
    metadata: execution.metadata ?? {
      ...(nodeRun?.nodeStatus ? { topologyNodeStatus: nodeRun.nodeStatus } : {}),
      ...(nodeRun?.nodeOutputs ? { topologyNodeOutputs: nodeRun.nodeOutputs } : {}),
      ...(nodeRun?.failedNodeIds ? { executionSummary: { failedNodeIds: nodeRun.failedNodeIds } } : {}),
    },
    missingFields,
    message:
      executionStatus === 'completed'
        ? execution.executionMode === 'campaign'
          ? 'Execution plan approved — campaign build completed'
          : 'Execution plan approved — topology execution completed'
        : executionStatus === 'awaiting_owner_input'
          ? awaitingMessage
          : executionStatus === 'failed'
            ? failedMessage
            : execution.executionMode === 'campaign'
              ? 'Execution plan approved — campaign execution started'
              : execution.executionMode === 'store'
                ? 'Execution plan approved — store setup started'
                : 'Execution plan approved — topology execution started',
    failureSummary,
    execution: {
      ...execution,
      nodeRun,
      failureSummary,
    },
    action: executionStatus === 'awaiting_owner_input' ? 'awaiting_owner_input' : 'show_execution_plan',
    multiAgentStatus: execution.metadata?.multiAgentStatus ?? metadata.multiAgentStatus ?? null,
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
  };
}
