/**
 * Runtime Mission Graph Orchestrator — graph-aware orchestration layer (Phase C).
 * Scheduler selects nodes; executeMissionStep dispatches tools. No direct tool dispatch here.
 */

import { randomUUID } from 'node:crypto';
import { getPrismaClient } from '../prisma.js';
import { executeMissionStep, isRuntimeStepExecutionEnabled } from './performerRuntimeKernel.js';
import { mergeProactiveStepStatus } from './runtimeStepState.js';
import { requireRuntimeCapability } from './runtimeCapabilitiesService.js';
import { ORCHESTRATION_STATUS } from './runtimeMissionStatus.js';
import { mergeOrchestrationState } from './runtimeOrchestrationState.js';
import {
  ensureMissionGraph,
  isRuntimeMissionGraphEnabled,
  persistMissionGraph,
} from './runtimeMissionGraphService.js';
import {
  analyzeGraphSchedule,
  getExecutableGraphNodes,
  isRuntimeGraphSchedulerEnabled,
} from './runtimeGraphScheduler.js';
import {
  getGraphNode,
  isGraphOrchestrationSuccessful,
  markNodeCompleted,
  markNodeFailed,
  markNodeRunning,
  patchGraphNode,
  readRuntimeMissionGraph,
  writeRuntimeMissionGraph,
} from './runtimeGraphExecutionState.js';
import { attachArtifactToGraphNode } from './runtimeGraphArtifactLineage.js';
import {
  emitGraphBarrierWaiting,
  emitGraphCompleted,
  emitGraphCreated,
  emitGraphNodeCompleted,
  emitGraphNodeFailed,
  emitGraphNodeRunning,
} from './runtimeGraphBlackboardBridge.js';
import { NODE_STATUS } from './runtimeGraphTypes.js';
import {
  executeGraphNodeWithSkillRuntime,
  isRuntimeSkillExecutionEnabled,
} from './skills/runtimeSkillExecutor.js';
import {
  executeGraphNodeViaDurableQueue,
  isRuntimeDurableExecutionEnabled,
} from './queue/runtimeDurableGraphExecution.js';

export function isRuntimeGraphOrchestrationEnabled() {
  return isRuntimeMissionGraphEnabled() && isRuntimeGraphSchedulerEnabled();
}

function resolveOrchestrationMode(result) {
  return result?.orchestrationMode ?? 'graph';
}

function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

async function persistGraphMetadata(prisma, missionId, metadataJson) {
  await prisma.missionPipeline.update({
    where: { id: missionId },
    data: { metadataJson },
  });
}

/**
 * Apply scheduler-derived statuses to graph nodes (non-terminal only).
 * @param {object} graph
 * @param {Map<string, string>} derivedStatus
 */
function applyDerivedStatuses(graph, derivedStatus) {
  let next = graph;
  for (const node of graph.nodes) {
    if ([NODE_STATUS.RUNNING, NODE_STATUS.COMPLETED, NODE_STATUS.FAILED, NODE_STATUS.CANCELLED].includes(node.status)) {
      continue;
    }
    const derived = derivedStatus.get(node.nodeId);
    if (derived && derived !== node.status) {
      next = patchGraphNode(next, node.nodeId, { status: derived });
    }
  }
  return next;
}

/**
 * Auto-complete barrier nodes that are ready.
 * @param {object} graph
 * @param {object[]} barriers
 */
function completeBarrierNodes(graph, barriers) {
  let next = graph;
  for (const barrier of barriers) {
    next = patchGraphNode(next, barrier.nodeId, markNodeCompleted(getGraphNode(next, barrier.nodeId)));
  }
  return next;
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
    source: 'runtime_mission_graph',
  });
}

/**
 * @param {object} ctx
 * @param {object} loaded
 */
async function prepareGraphContext(ctx, loaded) {
  const gateGraph = requireRuntimeCapability('runtimeMissionGraph', {
    source: ctx.source,
    missionId: ctx.missionId,
  });
  if (!gateGraph.ok) {
    return { ok: false, httpStatus: 503, code: gateGraph.code, message: gateGraph.message };
  }
  const gateSched = requireRuntimeCapability('runtimeGraphScheduler', {
    source: ctx.source,
    missionId: ctx.missionId,
  });
  if (!gateSched.ok) {
    return { ok: false, httpStatus: 503, code: gateSched.code, message: gateSched.message };
  }
  if (!isRuntimeGraphOrchestrationEnabled() || !isRuntimeStepExecutionEnabled()) {
    return { ok: false, httpStatus: 503, code: 'RUNTIME_CAPABILITY_UNAVAILABLE', message: 'Graph orchestration unavailable' };
  }

  let meta = loaded.meta ?? loaded.row?.metadataJson ?? {};
  const ensured = ensureMissionGraph(meta, ctx.missionId, {
    planSteps: ctx.planSteps ?? undefined,
    targetId: loaded.row?.targetId ?? null,
    targetType: loaded.row?.targetType ?? null,
  });

  if (!ensured.graph) {
    return {
      ok: false,
      httpStatus: 422,
      code: ensured.error ?? 'NO_MISSION_GRAPH',
      message: 'Could not build mission graph',
    };
  }

  meta = ensured.metadata;
  let graph = ensured.graph;

  if (ensured.created) {
    await emitGraphCreated(ctx.missionId, graph, ctx.traceId);
    meta = persistMissionGraph(meta, graph);
    await persistGraphMetadata(loaded.prisma, ctx.missionId, meta);
  }

  return { ok: true, meta, graph, prisma: loaded.prisma, row: loaded.row };
}

/**
 * Execute one graph tool node through kernel step API.
 */
async function executeGraphNode(ctx, prisma, missionId, meta, graph, node, planStepsTotal) {
  const stepNumber = Math.floor(Number(node.metadata?.stepNumber) || 1);
  const tool = str(node.assignedTool);
  const parameters = node.metadata?.parameters ?? {};

  await emitGraphNodeRunning(missionId, node, ctx.traceId);

  let runningGraph = patchGraphNode(graph, node.nodeId, markNodeRunning(node));
  let runningMeta = writeRuntimeMissionGraph(meta, runningGraph);
  runningMeta = syncStepStatusFromGraphNode(runningMeta, getGraphNode(runningGraph, node.nodeId));
  await persistGraphMetadata(prisma, missionId, runningMeta);

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
    body: {
      graphNodeId: node.nodeId,
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

  if (stepResult?.prerequisiteBlocked || stepResult?.code === 'PREREQUISITE_REQUIRED') {
    freshGraph = patchGraphNode(freshGraph, node.nodeId, {
      status: NODE_STATUS.WAITING_FOR_DECISION,
      metadata: { ...node.metadata, blockingReason: 'prerequisite_required' },
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
    freshMeta = persistMissionGraph(freshMeta, freshGraph);
    await persistGraphMetadata(prisma, missionId, freshMeta);
    return {
      ok: false,
      httpStatus: stepResult.httpStatus ?? 412,
      code: 'PREREQUISITE_REQUIRED',
      blocked: true,
      graphNodeId: node.nodeId,
      stepResult,
      graph: freshGraph,
      metadata: freshMeta,
    };
  }

  if (stepResult?.ok === false && !stepResult?.alreadyCompleted) {
    const failedNode = markNodeFailed(getGraphNode(freshGraph, node.nodeId), stepResult.message);
    freshGraph = patchGraphNode(freshGraph, node.nodeId, {
      ...failedNode,
      retries: { ...failedNode.retries, count: failedNode.retries.count + 1 },
    });
    freshMeta = persistMissionGraph(freshMeta, freshGraph);
    freshMeta = syncStepStatusFromGraphNode(freshMeta, getGraphNode(freshGraph, node.nodeId));
    await persistGraphMetadata(prisma, missionId, freshMeta);
    await emitGraphNodeFailed(missionId, failedNode, stepResult.message, ctx.traceId);
    return {
      ok: false,
      httpStatus: stepResult.httpStatus ?? 500,
      code: stepResult.code ?? 'GRAPH_NODE_FAILED',
      graphNodeId: node.nodeId,
      stepResult,
      graph: freshGraph,
      metadata: freshMeta,
    };
  }

  const output = stepResult?.output ?? {};
  const completedNode = markNodeCompleted(getGraphNode(freshGraph, node.nodeId), { result: output });
  freshGraph = patchGraphNode(freshGraph, node.nodeId, completedNode);
  freshMeta = persistMissionGraph(freshMeta, freshGraph);
  freshMeta = syncStepStatusFromGraphNode(freshMeta, getGraphNode(freshGraph, node.nodeId));

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
      metadata: { stepNumber },
    });
    freshMeta = persistMissionGraph(freshMeta, freshGraph);
  }

  await persistGraphMetadata(prisma, missionId, freshMeta);
  await emitGraphNodeCompleted(missionId, completedNode, ctx.traceId);

  return {
    ok: true,
    httpStatus: 200,
    code: 'GRAPH_NODE_COMPLETED',
    graphNodeId: node.nodeId,
    stepNumber,
    stepResult,
    graph: freshGraph,
    metadata: freshMeta,
  };
}

/**
 * @param {object} input
 * @param {object} loaded
 */
export async function runGraphNextStep(input, loaded) {
  const ctx = input;
  const prepared = await prepareGraphContext(ctx, loaded);
  if (!prepared.ok) return prepared;

  let { meta, graph, prisma } = prepared;
  const planStepsTotal = graph.nodes.filter((n) => n.assignedTool).length;

  let analysis = analyzeGraphSchedule(graph, {
    forceRetryNodeId: ctx.forceRetry ? ctx.graphNodeId ?? null : null,
  });

  for (const waiting of analysis.waitingBarriers) {
    const waitingOn = (waiting.dependencies ?? []).filter((depId) => {
      const dep = getGraphNode(graph, depId);
      return dep && dep.status !== NODE_STATUS.COMPLETED;
    });
    if (waitingOn.length > 0) {
      await emitGraphBarrierWaiting(ctx.missionId, waiting, waitingOn, ctx.traceId);
    }
  }

  graph = applyDerivedStatuses(graph, analysis.derivedStatus);
  graph = completeBarrierNodes(graph, analysis.autoCompleteBarriers);
  meta = persistMissionGraph(meta, graph);
  await persistGraphMetadata(prisma, ctx.missionId, meta);

  analysis = analyzeGraphSchedule(graph, {
    forceRetryNodeId: ctx.forceRetry ? ctx.graphNodeId ?? null : null,
  });

  if (analysis.isComplete || isGraphOrchestrationSuccessful(graph)) {
    await emitGraphCompleted(ctx.missionId, graph, ctx.traceId);
    return {
      ok: true,
      httpStatus: 200,
      code: 'GRAPH_ORCHESTRATION_COMPLETED',
      orchestrationMode: 'graph',
      graph,
      allStepsComplete: true,
    };
  }

  if (analysis.blockedNodes.length > 0 && analysis.executableNodes.length === 0) {
    return {
      ok: false,
      httpStatus: 409,
      code: 'GRAPH_BLOCKED',
      orchestrationMode: 'graph',
      blockedNodes: analysis.blockedNodes.map((n) => n.nodeId),
      graph,
    };
  }

  const targetNodeId = str(ctx.graphNodeId);
  let node = targetNodeId
    ? analysis.executableNodes.find((n) => n.nodeId === targetNodeId)
    : analysis.executableNodes[0];

  if (!node) {
    return {
      ok: true,
      httpStatus: 200,
      code: 'NO_EXECUTABLE_GRAPH_NODES',
      orchestrationMode: 'graph',
      waitingNodes: analysis.waitingNodes.map((n) => n.nodeId),
      graph,
    };
  }

  if (node.status === NODE_STATUS.RUNNING) {
    return {
      ok: false,
      httpStatus: 409,
      code: 'ALREADY_RUNNING',
      graphNodeId: node.nodeId,
      orchestrationMode: 'graph',
    };
  }

  let execResult;
  if (isRuntimeDurableExecutionEnabled() && isRuntimeSkillExecutionEnabled()) {
    execResult = await executeGraphNodeViaDurableQueue(
      ctx,
      prisma,
      ctx.missionId,
      meta,
      graph,
      node,
      planStepsTotal,
      analysis,
    );
  } else if (isRuntimeSkillExecutionEnabled()) {
    execResult = await executeGraphNodeWithSkillRuntime(
      ctx,
      prisma,
      ctx.missionId,
      meta,
      graph,
      node,
      planStepsTotal,
    );
  } else {
    execResult = await executeGraphNode(ctx, prisma, ctx.missionId, meta, graph, node, planStepsTotal);
  }

  const finalGraph = execResult.graph ?? graph;
  const finalAnalysis = analyzeGraphSchedule(finalGraph);
  if (finalAnalysis.isComplete) {
    await emitGraphCompleted(ctx.missionId, finalGraph, ctx.traceId);
    return { ...execResult, allStepsComplete: true, code: 'GRAPH_ORCHESTRATION_COMPLETED', orchestrationMode: resolveOrchestrationMode(execResult) };
  }

  return { ...execResult, orchestrationMode: resolveOrchestrationMode(execResult) };
}

/**
 * @param {object} input
 * @param {object} loaded
 * @param {{ singleStep?: boolean }} mode
 */
export async function runGraphStepsLoop(input, loaded, mode = {}) {
  const ctx = input;
  /** @type {object[]} */
  const nodesExecuted = [];
  let lastResult = null;
  let iterations = 0;

  while (iterations < ctx.maxSteps) {
    iterations += 1;
    lastResult = await runGraphNextStep(
      {
        ...ctx,
        graphNodeId: iterations === 1 ? ctx.graphNodeId : null,
        forceRetry: ctx.forceRetry && iterations === 1,
      },
      loaded,
    );

    if (lastResult.graphNodeId) {
      nodesExecuted.push({
        graphNodeId: lastResult.graphNodeId,
        stepNumber: lastResult.stepNumber ?? null,
        ok: lastResult.ok === true,
        code: lastResult.code,
      });
    }

    if (mode.singleStep) {
      return { ...lastResult, nodesExecuted, iterations: 1, orchestrationMode: resolveOrchestrationMode(lastResult) };
    }

    if (lastResult.blocked || lastResult.ok === false) {
      return { ...lastResult, nodesExecuted, iterations, orchestrationMode: resolveOrchestrationMode(lastResult) };
    }

    if (lastResult.allStepsComplete || lastResult.code === 'GRAPH_ORCHESTRATION_COMPLETED') {
      return { ...lastResult, nodesExecuted, iterations, orchestrationMode: resolveOrchestrationMode(lastResult) };
    }

    if (lastResult.code === 'NO_EXECUTABLE_GRAPH_NODES') {
      return { ...lastResult, nodesExecuted, iterations, orchestrationMode: resolveOrchestrationMode(lastResult) };
    }

    const freshRow = await loaded.prisma.missionPipeline.findUnique({ where: { id: ctx.missionId } });
    loaded = { ...loaded, row: freshRow, meta: freshRow?.metadataJson ?? loaded.meta };
  }

  return {
    ...(lastResult ?? {
      ok: false,
      httpStatus: 500,
      code: 'GRAPH_ITERATION_LIMIT',
    }),
    nodesExecuted,
    iterations,
    orchestrationMode: resolveOrchestrationMode(lastResult),
  };
}

export default {
  isRuntimeGraphOrchestrationEnabled,
  runGraphNextStep,
  runGraphStepsLoop,
};
