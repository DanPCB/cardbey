/**
 * Durable graph execution coordinator (Phase E).
 * Scheduler → queue → claim → skill worker execution → completion/recovery.
 */

import { getGraphNode } from '../runtimeGraphExecutionState.js';
import { executeGraphNodeWithSkillRuntime } from '../skills/runtimeSkillExecutor.js';
import {
  isRuntimeDurableExecutionEnabled,
  enqueueExecutableNodes,
  claimNextQueueItem,
  markQueueItemRunning,
  markQueueItemCompleted,
  markQueueItemFailed,
  requeueQueueItem,
} from './runtimeExecutionQueue.js';
import { emitQueueClaimed } from '../recovery/runtimeRecoveryBlackboardBridge.js';
import { runRecoveryPass } from '../recovery/runtimeWorkerRecoveryService.js';

export { isRuntimeDurableExecutionEnabled } from './runtimeExecutionQueue.js';

/**
 * Execute a graph node through durable queue semantics.
 *
 * @param {object} ctx
 * @param {object} prisma
 * @param {string} missionId
 * @param {object} meta
 * @param {object} graph
 * @param {object} node
 * @param {number} planStepsTotal
 * @param {object} analysis
 */
export async function executeGraphNodeViaDurableQueue(
  ctx,
  prisma,
  missionId,
  meta,
  graph,
  node,
  planStepsTotal,
  analysis,
) {
  if (!isRuntimeDurableExecutionEnabled()) {
    return executeGraphNodeWithSkillRuntime(ctx, prisma, missionId, meta, graph, node, planStepsTotal);
  }

  let workingMeta = meta;
  let workingGraph = graph;

  const recovery = await runRecoveryPass(workingMeta, workingGraph, missionId, {
    traceId: ctx.traceId,
    heartbeatStaleMs: ctx.heartbeatStaleMs,
  });
  workingMeta = recovery.metadata;
  workingGraph = recovery.graph;

  const enqueueResult = await enqueueExecutableNodes(
    workingMeta,
    missionId,
    workingGraph,
    analysis.executableNodes.length > 0 ? analysis.executableNodes : [node],
    { forceRetry: ctx.forceRetry, traceId: ctx.traceId },
  );
  workingMeta = enqueueResult.metadata;

  const claimed = claimNextQueueItem(workingMeta, workingGraph, {
    preferredNodeId: node.nodeId,
    claimedBy: ctx.requestId ?? ctx.source,
  });

  if (!claimed.ok || !claimed.item) {
    return {
      ok: false,
      httpStatus: 409,
      code: claimed.code ?? 'QUEUE_CLAIM_FAILED',
      graphNodeId: node.nodeId,
      orchestrationMode: 'durable_queue',
      graph: workingGraph,
      metadata: workingMeta,
    };
  }

  workingMeta = claimed.metadata;
  const queueItem = claimed.item;
  await emitQueueClaimed(missionId, queueItem, ctx.traceId);

  const targetNode = getGraphNode(workingGraph, queueItem.nodeId) ?? node;

  const execResult = await executeGraphNodeWithSkillRuntime(
    ctx,
    prisma,
    missionId,
    workingMeta,
    workingGraph,
    targetNode,
    planStepsTotal,
    { queueItem },
  );

  let finalMeta = execResult.metadata ?? workingMeta;
  const finalGraph = execResult.graph ?? workingGraph;
  const finalNode = getGraphNode(finalGraph, queueItem.nodeId) ?? targetNode;

  if (execResult.ok) {
    const completed = await markQueueItemCompleted(
      finalMeta,
      missionId,
      finalGraph,
      finalNode,
      queueItem.queueItemId,
      { traceId: ctx.traceId },
    );
    finalMeta = completed.metadata;
  } else if (execResult.retryable) {
    const requeued = await requeueQueueItem(finalMeta, missionId, queueItem.queueItemId, {
      traceId: ctx.traceId,
      reason: execResult.code ?? 'retryable_failure',
    });
    finalMeta = requeued.metadata;
  } else if (execResult.replayBlocked) {
    finalMeta = execResult.metadata ?? finalMeta;
  } else {
    const failed = await markQueueItemFailed(
      finalMeta,
      missionId,
      queueItem.queueItemId,
      execResult.message ?? execResult.code ?? 'execution_failed',
      { traceId: ctx.traceId },
    );
    finalMeta = failed.metadata;
  }

  await persistGraphMetadata(prisma, missionId, finalMeta);

  return {
    ...execResult,
    metadata: finalMeta,
    graph: finalGraph,
    queueItemId: queueItem.queueItemId,
    orchestrationMode: 'durable_queue',
  };
}

async function persistGraphMetadata(prisma, missionId, metadataJson) {
  await prisma.missionPipeline.update({
    where: { id: missionId },
    data: { metadataJson },
  });
}

export default {
  isRuntimeDurableExecutionEnabled,
  executeGraphNodeViaDurableQueue,
};
