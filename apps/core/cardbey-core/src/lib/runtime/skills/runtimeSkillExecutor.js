/**
 * Runtime Skill Executor — skill-based graph node execution (Phase D).
 * Scheduler selects nodes; skill executor runs workers → executeMissionStep.
 * Workers never mutate graph state directly; this module uses graph runtime services.
 */

import { executeMissionStep } from '../performerRuntimeKernel.js';
import { getRuntimeCapabilities } from '../runtimeCapabilitiesService.js';
import { mergeProactiveStepStatus } from '../runtimeStepState.js';
import { persistMissionGraph } from '../runtimeMissionGraphService.js';
import {
  getGraphNode,
  markNodeCompleted,
  markNodeFailed,
  markNodeRunning,
  patchGraphNode,
  readRuntimeMissionGraph,
  writeRuntimeMissionGraph,
} from '../runtimeGraphExecutionState.js';
import { attachArtifactToGraphNode } from '../runtimeGraphArtifactLineage.js';
import {
  emitGraphNodeCompleted,
  emitGraphNodeFailed,
  emitGraphNodeRunning,
} from '../runtimeGraphBlackboardBridge.js';
import { NODE_STATUS, EXECUTION_MODE } from '../runtimeGraphTypes.js';
import { resolveSkillForGraphNode, assertSkillSupportsNodeTool } from './runtimeSkillResolver.js';
import { createWorker, markWorkerRunning, touchWorkerHeartbeat, markWorkerCompleted, markWorkerFailed, getWorkerById } from '../workers/runtimeWorkerManager.js';
import { acquireExecutionLease, releaseExecutionLease, expireStaleLeases } from '../workers/runtimeWorkerLease.js';
import { createWorkerContext } from '../workers/runtimeWorkerContext.js';
import {
  emitWorkerStarted,
  emitWorkerHeartbeat,
  emitWorkerCompleted,
  emitWorkerFailed,
  emitSkillExecuting,
  emitSkillCompleted,
} from '../workers/runtimeWorkerBlackboardBridge.js';
import { markQueueItemRunning } from '../queue/runtimeExecutionQueue.js';

function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

export function isRuntimeSkillRuntimeEnabled() {
  return getRuntimeCapabilities().runtimeSkillRuntime === true;
}

export function isRuntimeSkillExecutionEnabled() {
  const caps = getRuntimeCapabilities();
  return (
    caps.runtimeSkillRuntime === true &&
    caps.runtimeWorkerManager === true &&
    caps.runtimeExecutionLeases === true
  );
}

function syncStepStatusFromGraphNode(metadataJson, node) {
  const stepNumber = Math.floor(Number(node.metadata?.stepNumber));
  if (!Number.isFinite(stepNumber) || stepNumber < 1) return metadataJson;
  const statusMap = {
    [NODE_STATUS.COMPLETED]: 'completed',
    [NODE_STATUS.FAILED]: 'failed',
    [NODE_STATUS.RUNNING]: 'running',
    [NODE_STATUS.BLOCKED]: 'blocked',
  };
  const stepStatus = statusMap[node.status];
  if (!stepStatus) return metadataJson;
  return mergeProactiveStepStatus(metadataJson, stepNumber, {
    status: stepStatus,
    tool: node.assignedTool,
    graphNodeId: node.nodeId,
    source: 'runtime_skill_executor',
  });
}

function shouldRetryNode(node, skill, forceRetry) {
  if (forceRetry) return true;
  if (node.executionMode !== EXECUTION_MODE.RETRYABLE && skill.executionMode !== 'retryable') {
    return false;
  }
  const maxRetries = Math.max(
    Math.floor(Number(skill.retryPolicy?.maxRetries) || 0),
    Math.floor(Number(node.retries?.max) || 0),
  );
  const count = Math.floor(Number(node.retries?.count) || 0);
  return count < maxRetries;
}

/**
 * Execute one graph node through skill runtime → worker → executeMissionStep.
 *
 * @param {object} ctx
 * @param {object} prisma
 * @param {string} missionId
 * @param {object} meta
 * @param {object} graph
 * @param {object} node
 * @param {number} planStepsTotal
 * @param {{ queueItem?: object|null }} [options]
 */
export async function executeGraphNodeWithSkillRuntime(
  ctx,
  prisma,
  missionId,
  meta,
  graph,
  node,
  planStepsTotal,
  options = {},
) {
  const stepNumber = Math.floor(Number(node.metadata?.stepNumber) || 1);
  const tool = str(node.assignedTool);
  const parameters = node.metadata?.parameters ?? {};

  const resolved = resolveSkillForGraphNode(node);
  if (!resolved.skill) {
    return {
      ok: false,
      httpStatus: 422,
      code: resolved.error ?? 'SKILL_RESOLUTION_FAILED',
      graphNodeId: node.nodeId,
      message: `Could not resolve skill for node ${node.nodeId}`,
    };
  }

  const skill = resolved.skill;
  const toolCheck = assertSkillSupportsNodeTool(skill, node);
  if (!toolCheck.ok) {
    return {
      ok: false,
      httpStatus: 422,
      code: toolCheck.code,
      graphNodeId: node.nodeId,
      skillId: skill.skillId,
    };
  }

  let workingMeta = expireStaleLeases(meta);
  const ownerId = str(ctx.requestId) || str(ctx.traceId) || 'runtime_kernel';

  const { worker, metadata: metaWithWorker } = createWorker(workingMeta, {
    graphId: graph.graphId,
    nodeId: node.nodeId,
    assignedSkill: skill,
    metadata: { resolvedVia: resolved.resolvedVia, stepNumber },
  });
  workingMeta = metaWithWorker;

  const leaseResult = acquireExecutionLease(workingMeta, {
    nodeId: node.nodeId,
    ownerId,
    workerId: worker.workerId,
    ttlMs: skill.timeoutPolicy?.timeoutMs ?? 300_000,
  });

  if (!leaseResult.ok) {
    return {
      ok: false,
      httpStatus: 409,
      code: leaseResult.code ?? 'LEASE_ACQUIRE_FAILED',
      graphNodeId: node.nodeId,
      lease: leaseResult.lease,
    };
  }

  workingMeta = leaseResult.metadata;
  const lease = leaseResult.lease;

  workingMeta = markWorkerRunning(workingMeta, worker.workerId);
  if (options.queueItem?.queueItemId) {
    workingMeta = markQueueItemRunning(workingMeta, options.queueItem.queueItemId, worker.workerId);
  }
  const runningWorker = getWorkerById(workingMeta, worker.workerId);

  const workerContext = createWorkerContext({
    missionId,
    graphId: graph.graphId,
    node,
    skill,
    workerId: worker.workerId,
    leaseId: lease?.leaseId ?? null,
    row: ctx.row ?? null,
    metadataJson: workingMeta,
    traceId: ctx.traceId,
    requestId: ctx.requestId,
    continuationHint: graph.orchestrationState?.continuationHint ?? null,
  });

  await emitGraphNodeRunning(missionId, node, ctx.traceId);
  await emitWorkerStarted(missionId, runningWorker ?? worker, workerContext, ctx.traceId);
  await emitSkillExecuting(missionId, skill, node, worker.workerId, ctx.traceId);

  let runningGraph = patchGraphNode(graph, node.nodeId, {
    ...markNodeRunning(node),
    metadata: {
      ...node.metadata,
      workerId: worker.workerId,
      skillId: skill.skillId,
      leaseId: lease?.leaseId ?? null,
    },
  });
  let runningMeta = writeRuntimeMissionGraph(workingMeta, runningGraph);
  runningMeta = syncStepStatusFromGraphNode(runningMeta, getGraphNode(runningGraph, node.nodeId));
  await persistGraphMetadata(prisma, missionId, runningMeta);

  runningMeta = touchWorkerHeartbeat(runningMeta, worker.workerId);
  const heartbeatWorker = getWorkerById(runningMeta, worker.workerId);
  await emitWorkerHeartbeat(missionId, heartbeatWorker ?? worker, ctx.traceId);

  const stepResult = await executeMissionStep({
    user: ctx.user,
    missionId,
    stepNumber,
    requestedTool: tool,
    source: ctx.source,
    traceId: ctx.traceId,
    requestId: ctx.requestId,
    parameters,
    proactivePlanTotal: planStepsTotal,
    forceRetry: ctx.forceRetry,
    targetContext: workerContext.targetContext,
    continuationContract: workerContext.continuationContext?.continuationHint ?? null,
    body: {
      graphNodeId: node.nodeId,
      workerId: worker.workerId,
      skillId: skill.skillId,
      workerContext,
      proactivePlanStep: { step: stepNumber, title: node.label },
      parameters,
    },
  });

  const refreshed = await prisma.missionPipeline.findUnique({
    where: { id: missionId },
    select: { metadataJson: true },
  });
  let freshMeta = refreshed?.metadataJson ?? runningMeta;
  let freshGraph = readRuntimeMissionGraph(freshMeta) ?? runningGraph;

  const releaseLease = (m) => (lease?.leaseId ? releaseExecutionLease(m, lease.leaseId) : m);

  if (stepResult?.prerequisiteBlocked || stepResult?.code === 'PREREQUISITE_REQUIRED') {
    freshGraph = patchGraphNode(freshGraph, node.nodeId, {
      status: NODE_STATUS.WAITING_FOR_DECISION,
      metadata: {
        ...node.metadata,
        workerId: worker.workerId,
        skillId: skill.skillId,
        blockingReason: 'prerequisite_required',
      },
    });
    freshGraph = {
      ...freshGraph,
      orchestrationState: {
        ...freshGraph.orchestrationState,
        blockedNodeId: node.nodeId,
        lastBlockedReason: 'prerequisite_required',
        continuationHint: stepResult.resumableIntent ?? null,
      },
    };
    freshMeta = persistMissionGraph(releaseLease(freshMeta), freshGraph);
    freshMeta = markWorkerFailed(freshMeta, worker.workerId, 'prerequisite_required');
    await persistGraphMetadata(prisma, missionId, freshMeta);
    await emitWorkerFailed(missionId, getWorkerById(freshMeta, worker.workerId) ?? worker, 'prerequisite_required', ctx.traceId);
    return {
      ok: false,
      httpStatus: stepResult.httpStatus ?? 412,
      code: 'PREREQUISITE_REQUIRED',
      blocked: true,
      graphNodeId: node.nodeId,
      workerId: worker.workerId,
      skillId: skill.skillId,
      stepResult,
      graph: freshGraph,
      metadata: freshMeta,
    };
  }

  if (stepResult?.ok === false && !stepResult?.alreadyCompleted) {
    const retryable = shouldRetryNode(node, skill, ctx.forceRetry);
    const failedNode = markNodeFailed(getGraphNode(freshGraph, node.nodeId), stepResult.message);
    freshGraph = patchGraphNode(freshGraph, node.nodeId, {
      ...failedNode,
      retries: { ...failedNode.retries, count: failedNode.retries.count + 1 },
      metadata: {
        ...failedNode.metadata,
        workerId: worker.workerId,
        skillId: skill.skillId,
        retryable,
      },
    });
    freshMeta = persistMissionGraph(releaseLease(freshMeta), freshGraph);
    freshMeta = syncStepStatusFromGraphNode(freshMeta, getGraphNode(freshGraph, node.nodeId));
    freshMeta = markWorkerFailed(freshMeta, worker.workerId, stepResult.message, {
      retryable,
      retryCount: failedNode.retries.count,
    });
    await persistGraphMetadata(prisma, missionId, freshMeta);
    await emitGraphNodeFailed(missionId, failedNode, stepResult.message, ctx.traceId);
    await emitWorkerFailed(missionId, getWorkerById(freshMeta, worker.workerId) ?? worker, stepResult.message, ctx.traceId);
    return {
      ok: false,
      httpStatus: stepResult.httpStatus ?? 500,
      code: retryable ? 'SKILL_EXECUTION_RETRYABLE' : stepResult.code ?? 'GRAPH_NODE_FAILED',
      graphNodeId: node.nodeId,
      workerId: worker.workerId,
      skillId: skill.skillId,
      retryable,
      stepResult,
      graph: freshGraph,
      metadata: freshMeta,
    };
  }

  const output = stepResult?.output ?? {};
  const completedNode = markNodeCompleted(getGraphNode(freshGraph, node.nodeId), { result: output });
  freshGraph = patchGraphNode(freshGraph, node.nodeId, {
    ...completedNode,
    metadata: {
      ...completedNode.metadata,
      workerId: worker.workerId,
      skillId: skill.skillId,
    },
  });
  freshMeta = persistMissionGraph(releaseLease(freshMeta), freshGraph);
  freshMeta = syncStepStatusFromGraphNode(freshMeta, getGraphNode(freshGraph, node.nodeId));
  freshMeta = markWorkerCompleted(freshMeta, worker.workerId, { stepNumber, tool });

  const artifactRef =
    typeof output.artifactRef === 'string'
      ? output.artifactRef
      : typeof output.promotionId === 'string'
        ? `promotion:${output.promotionId}`
        : typeof output.summary === 'string'
          ? `output:${node.nodeId}`
          : null;

  if (artifactRef) {
    freshGraph = attachArtifactToGraphNode(freshGraph, {
      nodeId: node.nodeId,
      artifactRef,
      artifactType: tool,
      targetId: node.targetId,
      parentLineage: node.dependencies?.[0] ?? null,
      workerId: worker.workerId,
      skillId: skill.skillId,
      metadata: { stepNumber },
    });
    freshMeta = persistMissionGraph(freshMeta, freshGraph);
  }

  await persistGraphMetadata(prisma, missionId, freshMeta);
  await emitGraphNodeCompleted(missionId, completedNode, ctx.traceId);
  await emitSkillCompleted(missionId, skill, node, worker.workerId, ctx.traceId);
  await emitWorkerCompleted(missionId, getWorkerById(freshMeta, worker.workerId) ?? worker, ctx.traceId);

  return {
    ok: true,
    httpStatus: 200,
    code: 'GRAPH_NODE_COMPLETED',
    graphNodeId: node.nodeId,
    workerId: worker.workerId,
    skillId: skill.skillId,
    stepNumber,
    stepResult,
    graph: freshGraph,
    metadata: freshMeta,
    executionMode: 'skill_runtime',
  };
}

async function persistGraphMetadata(prisma, missionId, metadataJson) {
  await prisma.missionPipeline.update({
    where: { id: missionId },
    data: { metadataJson },
  });
}

export default {
  isRuntimeSkillRuntimeEnabled,
  isRuntimeSkillExecutionEnabled,
  executeGraphNodeWithSkillRuntime,
};
