/**
 * Durable graph node lifecycle persistence (Phase C).
 */

import { NODE_STATUS, TERMINAL_NODE_STATUSES } from './runtimeGraphTypes.js';

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * @param {unknown} metadataJson
 */
export function readRuntimeMissionGraph(metadataJson) {
  const meta = asObject(metadataJson);
  const graph = asObject(meta.runtimeMissionGraph);
  if (!graph.graphId || !graph.missionId) return null;
  return {
    graphId: str(graph.graphId),
    missionId: str(graph.missionId),
    version: Math.floor(Number(graph.version) || 1),
    nodes: Array.isArray(graph.nodes) ? graph.nodes.map(normalizeNode) : [],
    edges: Array.isArray(graph.edges) ? graph.edges.map(normalizeEdge) : [],
    orchestrationState: asObject(graph.orchestrationState),
    artifactLineage: Array.isArray(graph.artifactLineage) ? graph.artifactLineage : [],
    createdAt: str(graph.createdAt) || null,
    updatedAt: str(graph.updatedAt) || null,
  };
}

function normalizeNode(raw) {
  const n = asObject(raw);
  return {
    nodeId: str(n.nodeId),
    nodeType: str(n.nodeType) || 'tool_step',
    label: str(n.label) || str(n.nodeId),
    executionMode: str(n.executionMode) || 'sequential',
    status: str(n.status) || NODE_STATUS.PENDING,
    assignedTool: str(n.assignedTool) || null,
    assignedAgent: str(n.assignedAgent) || null,
    targetId: str(n.targetId) || null,
    targetType: str(n.targetType) || null,
    dependencies: Array.isArray(n.dependencies) ? n.dependencies.map(str).filter(Boolean) : [],
    outputs: asObject(n.outputs),
    retries: {
      count: Math.max(0, Math.floor(Number(n.retries?.count) || 0)),
      max: Math.max(0, Math.floor(Number(n.retries?.max) || 3)),
    },
    startedAt: str(n.startedAt) || null,
    completedAt: str(n.completedAt) || null,
    failedAt: str(n.failedAt) || null,
    metadata: asObject(n.metadata),
  };
}

function normalizeEdge(raw) {
  const e = asObject(raw);
  return {
    fromNodeId: str(e.fromNodeId),
    toNodeId: str(e.toNodeId),
    edgeType: str(e.edgeType) || 'depends_on',
  };
}

/**
 * @param {object} metadataJson
 * @param {object} graph
 */
export function writeRuntimeMissionGraph(metadataJson, graph) {
  const meta = asObject(metadataJson);
  const now = new Date().toISOString();
  return {
    ...meta,
    runtimeMissionGraph: {
      ...graph,
      updatedAt: now,
      createdAt: graph.createdAt || now,
    },
  };
}

/**
 * @param {object} graph
 * @param {string} nodeId
 * @param {object} patch
 */
export function patchGraphNode(graph, nodeId, patch) {
  const id = str(nodeId);
  const nodes = graph.nodes.map((n) => {
    if (n.nodeId !== id) return n;
    const next = { ...n, ...(patch && typeof patch === 'object' ? patch : {}) };
    if (patch?.retries && typeof patch.retries === 'object') {
      next.retries = { ...n.retries, ...patch.retries };
    }
    if (patch?.outputs && typeof patch.outputs === 'object') {
      next.outputs = { ...n.outputs, ...patch.outputs };
    }
    if (patch?.metadata && typeof patch.metadata === 'object') {
      next.metadata = { ...n.metadata, ...patch.metadata };
    }
    return next;
  });
  return { ...graph, nodes };
}

/**
 * @param {object} graph
 * @param {string} nodeId
 */
export function getGraphNode(graph, nodeId) {
  const id = str(nodeId);
  return graph.nodes.find((n) => n.nodeId === id) ?? null;
}

/**
 * @param {object} graph
 */
export function isGraphComplete(graph) {
  if (!graph?.nodes?.length) return false;
  return graph.nodes.every((n) => TERMINAL_NODE_STATUSES.has(n.status));
}

/**
 * @param {object} graph
 */
export function isGraphOrchestrationSuccessful(graph) {
  if (!graph?.nodes?.length) return false;
  return graph.nodes.every((n) => n.status === NODE_STATUS.COMPLETED);
}

export function markNodeRunning(node) {
  return {
    ...node,
    status: NODE_STATUS.RUNNING,
    startedAt: node.startedAt || new Date().toISOString(),
  };
}

export function markNodeCompleted(node, outputs = {}) {
  return {
    ...node,
    status: NODE_STATUS.COMPLETED,
    completedAt: new Date().toISOString(),
    outputs: { ...node.outputs, ...outputs },
  };
}

export function markNodeFailed(node, reason = null) {
  return {
    ...node,
    status: NODE_STATUS.FAILED,
    failedAt: new Date().toISOString(),
    metadata: { ...node.metadata, failureReason: reason },
  };
}
