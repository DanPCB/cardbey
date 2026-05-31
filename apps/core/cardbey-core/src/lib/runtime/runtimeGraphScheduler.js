/**
 * Runtime Graph Scheduler — determines executable nodes (Phase C).
 * Does NOT execute tools.
 */

import {
  BLOCKING_NODE_STATUSES,
  EXECUTION_MODE,
  NODE_STATUS,
  NODE_TYPE,
  TERMINAL_NODE_STATUSES,
} from './runtimeGraphTypes.js';
import { getGraphNode } from './runtimeGraphExecutionState.js';
import { getRuntimeCapabilities } from './runtimeCapabilitiesService.js';

export function isRuntimeGraphSchedulerEnabled() {
  return getRuntimeCapabilities().runtimeGraphScheduler === true;
}

function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function dependencyNodes(graph, nodeId) {
  const node = getGraphNode(graph, nodeId);
  if (!node) return [];
  return (node.dependencies ?? [])
    .map((depId) => getGraphNode(graph, depId))
    .filter(Boolean);
}

function dependencyBlocks(depNode) {
  return BLOCKING_NODE_STATUSES.has(depNode.status);
}

function dependencySatisfied(depNode) {
  return depNode.status === NODE_STATUS.COMPLETED;
}

/**
 * @param {object} graph
 * @param {{ forceRetryNodeId?: string|null }} [opts]
 */
export function analyzeGraphSchedule(graph, opts = {}) {
  const forceRetryNodeId = str(opts.forceRetryNodeId) || null;

  /** @type {Map<string, string>} */
  const derivedStatus = new Map();

  for (const node of graph.nodes) {
    if (node.status === NODE_STATUS.RUNNING) {
      derivedStatus.set(node.nodeId, NODE_STATUS.RUNNING);
      continue;
    }
    if (TERMINAL_NODE_STATUSES.has(node.status) && node.nodeId !== forceRetryNodeId) {
      derivedStatus.set(node.nodeId, node.status);
      continue;
    }

    const deps = dependencyNodes(graph, node.nodeId);
    if (deps.some(dependencyBlocks)) {
      derivedStatus.set(node.nodeId, NODE_STATUS.BLOCKED);
      continue;
    }

    const allDepsComplete = deps.length === 0 || deps.every(dependencySatisfied);
    if (!allDepsComplete) {
      derivedStatus.set(node.nodeId, NODE_STATUS.WAITING_FOR_DEPENDENCY);
      continue;
    }

    if (node.nodeType === NODE_TYPE.BARRIER || node.executionMode === EXECUTION_MODE.BARRIER) {
      derivedStatus.set(node.nodeId, NODE_STATUS.READY);
      continue;
    }

    if (node.status === NODE_STATUS.FAILED) {
      if (
        forceRetryNodeId === node.nodeId ||
        (node.executionMode === EXECUTION_MODE.RETRYABLE && node.retries.count < node.retries.max)
      ) {
        derivedStatus.set(node.nodeId, NODE_STATUS.READY);
      } else {
        derivedStatus.set(node.nodeId, NODE_STATUS.FAILED);
      }
      continue;
    }

    if (node.status === NODE_STATUS.WAITING_FOR_DECISION) {
      derivedStatus.set(node.nodeId, NODE_STATUS.WAITING_FOR_DECISION);
      continue;
    }

    derivedStatus.set(node.nodeId, NODE_STATUS.READY);
  }

  const executableNodes = graph.nodes.filter((n) => {
    const st = derivedStatus.get(n.nodeId);
    if (st !== NODE_STATUS.READY) return false;
    if (n.nodeType === NODE_TYPE.BARRIER || n.executionMode === EXECUTION_MODE.BARRIER) return false;
    return Boolean(n.assignedTool);
  });

  const autoCompleteBarriers = graph.nodes.filter((n) => {
    const st = derivedStatus.get(n.nodeId);
    return (
      st === NODE_STATUS.READY &&
      (n.nodeType === NODE_TYPE.BARRIER || n.executionMode === EXECUTION_MODE.BARRIER)
    );
  });

  const waitingBarriers = graph.nodes.filter((n) => {
    const st = derivedStatus.get(n.nodeId);
    return (
      (n.nodeType === NODE_TYPE.BARRIER || n.executionMode === EXECUTION_MODE.BARRIER) &&
      st === NODE_STATUS.WAITING_FOR_DEPENDENCY
    );
  });

  const blockedNodes = graph.nodes.filter((n) => derivedStatus.get(n.nodeId) === NODE_STATUS.BLOCKED);
  const waitingNodes = graph.nodes.filter(
    (n) => derivedStatus.get(n.nodeId) === NODE_STATUS.WAITING_FOR_DEPENDENCY,
  );

  const isComplete =
    graph.nodes.length > 0 &&
    graph.nodes.every((n) => derivedStatus.get(n.nodeId) === NODE_STATUS.COMPLETED);

  const hasFailed = graph.nodes.some((n) => derivedStatus.get(n.nodeId) === NODE_STATUS.FAILED);

  return {
    derivedStatus,
    executableNodes,
    autoCompleteBarriers,
    waitingBarriers,
    blockedNodes,
    waitingNodes,
    isComplete,
    hasFailed,
    parallelReadyCount: executableNodes.length,
  };
}

export function getExecutableGraphNodes(graph, opts = {}) {
  const analysis = analyzeGraphSchedule(graph, opts);
  const limit = Math.max(1, Math.floor(Number(opts.limit) || 50));
  return {
    ...analysis,
    nextExecutable: analysis.executableNodes.slice(0, limit),
  };
}

export default {
  isRuntimeGraphSchedulerEnabled,
  analyzeGraphSchedule,
  getExecutableGraphNodes,
};
