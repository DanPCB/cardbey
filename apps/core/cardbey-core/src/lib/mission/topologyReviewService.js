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
    return {
      ok: true,
      status: 'rejected',
      missionId: mid,
      metadata,
      message: 'Execution plan rejected',
    };
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
    return {
      ok: true,
      status: 'pending_approval',
      missionId: mid,
      metadata,
      message: 'Execution plan updated — awaiting approval',
    };
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

  return {
    ok: execution.ok !== false,
    status: executionStatus,
    missionId: mid,
    executionMode: execution.executionMode ?? 'generic',
    metadata: execution.metadata,
    message:
      executionStatus === 'completed'
        ? execution.executionMode === 'campaign'
          ? 'Execution plan approved — campaign build completed'
          : 'Execution plan approved — topology execution completed'
        : executionStatus === 'failed'
          ? 'Execution plan approved — topology execution failed'
          : execution.executionMode === 'campaign'
            ? 'Execution plan approved — campaign execution started'
            : execution.executionMode === 'store'
              ? 'Execution plan approved — store setup started'
              : 'Execution plan approved — topology execution started',
    execution,
  };
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
    pendingTopology: meta.pendingTopology ?? null,
    pendingPolicy: meta.pendingPolicy ?? null,
    pendingReasoning: meta.pendingReasoning ?? null,
    approvedTopology: meta.approvedTopology ?? null,
    approvedPolicy: meta.approvedPolicy ?? null,
    approvedReasoning: meta.approvedReasoning ?? null,
  };
}
