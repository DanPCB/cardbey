/**
 * Graph lifecycle blackboard bridge (Phase C).
 */

import { appendEvent } from '../missionBlackboard.js';

export async function emitGraphLifecycleEvent(missionId, eventType, payload, traceId = null) {
  try {
    await appendEvent(missionId, eventType, payload, traceId ? { traceId } : {});
  } catch (e) {
    console.warn(`[GraphBlackboard] ${eventType} emit failed:`, e?.message || e);
  }
}

export async function emitGraphCreated(missionId, graph, traceId) {
  return emitGraphLifecycleEvent(
    missionId,
    'runtime.graph.created',
    { graphId: graph.graphId, nodeCount: graph.nodes.length, edgeCount: graph.edges.length },
    traceId,
  );
}

export async function emitGraphNodeRunning(missionId, node, traceId) {
  return emitGraphLifecycleEvent(
    missionId,
    'runtime.graph.node.running',
    { nodeId: node.nodeId, assignedTool: node.assignedTool },
    traceId,
  );
}

export async function emitGraphNodeCompleted(missionId, node, traceId) {
  return emitGraphLifecycleEvent(
    missionId,
    'runtime.graph.node.completed',
    { nodeId: node.nodeId, assignedTool: node.assignedTool },
    traceId,
  );
}

export async function emitGraphNodeFailed(missionId, node, reason, traceId) {
  return emitGraphLifecycleEvent(
    missionId,
    'runtime.graph.node.failed',
    { nodeId: node.nodeId, assignedTool: node.assignedTool, reason },
    traceId,
  );
}

export async function emitGraphBarrierWaiting(missionId, barrierNode, waitingOn, traceId) {
  return emitGraphLifecycleEvent(
    missionId,
    'runtime.graph.barrier.waiting',
    { nodeId: barrierNode.nodeId, waitingOn },
    traceId,
  );
}

export async function emitGraphCompleted(missionId, graph, traceId) {
  return emitGraphLifecycleEvent(
    missionId,
    'runtime.graph.completed',
    { graphId: graph.graphId, nodeCount: graph.nodes.length },
    traceId,
  );
}

export default {
  emitGraphLifecycleEvent,
  emitGraphCreated,
  emitGraphNodeRunning,
  emitGraphNodeCompleted,
  emitGraphNodeFailed,
  emitGraphBarrierWaiting,
  emitGraphCompleted,
};
