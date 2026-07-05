/**
 * topologyNodeRunner — execute approved topology nodes in dependency order (Phase 4).
 */

import { getExecutor } from '../toolExecutors/index.js';
import { writeMetadata } from '../persistence/metadataWriter.js';
import { buildCampaignNodeInput } from './topologyCampaignInputs.js';

/** Tools that may soft-fail without blocking downstream packaging. */
const SOFT_FAIL_TOOLS = new Set(['generate_slideshow', 'generate_poster']);

/**
 * @param {import('../artifact/types.ts').TopologyNode | Record<string, unknown>} node
 * @returns {string[]}
 */
export function getNodeDependencies(node) {
  if (Array.isArray(node?.dependsOn)) {
    return node.dependsOn.map((d) => String(d).trim()).filter(Boolean);
  }
  const config = node?.config;
  if (config && typeof config === 'object' && Array.isArray(config.dependsOn)) {
    return config.dependsOn.map((d) => String(d).trim()).filter(Boolean);
  }
  return [];
}

/**
 * @param {Array<import('../artifact/types.ts').TopologyNode | Record<string, unknown>>} nodes
 * @returns {string[]}
 */
export function getRunnableNodeIds(nodes, nodeStatus) {
  if (!Array.isArray(nodes)) return [];

  return nodes
    .filter((node) => {
      const id = String(node?.id ?? '').trim();
      if (!id || nodeStatus[id] !== 'pending') return false;
      const deps = getNodeDependencies(node);
      return deps.every((dep) => nodeStatus[dep] === 'completed' || nodeStatus[dep] === 'skipped');
    })
    .map((node) => String(node.id).trim());
}

/**
 * @param {Array<import('../artifact/types.ts').TopologyNode | Record<string, unknown>>} nodes
 * @returns {Record<string, 'pending'>}
 */
export function initializeNodeStatus(nodes) {
  /** @type {Record<string, 'pending'>} */
  const status = {};
  for (const node of nodes) {
    const id = String(node?.id ?? '').trim();
    if (id) status[id] = 'pending';
  }
  return status;
}

/**
 * @param {string} toolName
 * @param {import('../artifact/types.ts').TopologyNode | Record<string, unknown>} node
 * @param {Record<string, unknown>} executionContext
 * @param {Record<string, unknown>} toolOutputs
 */
export function buildNodeInput(toolName, node, executionContext, toolOutputs) {
  const mode = String(executionContext.executionMode ?? 'generic').trim();
  if (mode === 'campaign') {
    return buildCampaignNodeInput(node, {
      storeId: executionContext.storeId,
      goal: executionContext.goal,
      toolOutputs,
    });
  }
  return {
    storeId: executionContext.storeId ?? null,
    ...(executionContext.goal ? { objective: executionContext.goal } : {}),
  };
}

/**
 * @param {import('../artifact/types.ts').TopologyNode | Record<string, unknown>} node
 * @param {Record<string, unknown>} input
 * @param {Record<string, unknown>} executionContext
 */
export async function dispatchTopologyNode(node, input, executionContext) {
  const toolName = String(node?.toolName ?? '').trim();
  if (!toolName) {
    return {
      status: 'failed',
      error: { code: 'MISSING_TOOL', message: 'Topology node is missing toolName' },
    };
  }

  const executor = getExecutor(toolName);
  if (!executor || typeof executor.execute !== 'function') {
    return {
      status: 'failed',
      error: { code: 'NO_EXECUTOR', message: `No executor registered for ${toolName}` },
    };
  }

  const context = {
    missionId: executionContext.missionId,
    storeId: executionContext.storeId ?? undefined,
    userId: executionContext.userId ?? undefined,
    tenantId: executionContext.tenantId ?? undefined,
    goal: executionContext.goal ?? undefined,
    runtimeOwned: true,
    performerRuntimeOwned: true,
    source: 'topology_executor',
    stepOutputs: executionContext.toolOutputs ?? {},
  };

  try {
    return await executor.execute(input, context);
  } catch (err) {
    return {
      status: 'failed',
      error: {
        code: 'EXECUTOR_ERROR',
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

/**
 * @param {unknown} result
 * @returns {Record<string, unknown> | null}
 */
function extractToolOutput(result) {
  if (!result || typeof result !== 'object') return null;
  const output = /** @type {Record<string, unknown>} */ (result).output;
  if (output && typeof output === 'object' && !Array.isArray(output)) {
    return output;
  }
  return null;
}

/**
 * @param {Record<string, unknown>} toolOutputs
 * @returns {Record<string, unknown>}
 */
export function aggregateTopologyOutputs(toolOutputs) {
  const artifactOut = toolOutputs.package_campaign_artifact;
  const artifact =
    artifactOut && typeof artifactOut === 'object' && artifactOut.artifact ? artifactOut.artifact : null;

  return {
    topologyToolOutputs: { ...toolOutputs },
    ...(artifact ? { campaignArtifact: artifact, campaignPackage: artifact } : {}),
  };
}

/**
 * Execute all topology nodes respecting dependsOn edges.
 *
 * @param {string} missionId
 * @param {import('../artifact/types.ts').TopologyArtifact | Record<string, unknown>} topology
 * @param {Record<string, unknown>} executionContext
 */
export async function runTopologyNodes(missionId, topology, executionContext = {}) {
  const mid = String(missionId ?? '').trim();
  const nodes = Array.isArray(topology?.nodes) ? topology.nodes : [];
  if (!mid || !nodes.length) {
    throw new Error('runTopologyNodes requires missionId and topology.nodes');
  }

  const nodeById = new Map(nodes.map((node) => [String(node.id).trim(), node]));
  const nodeStatus = initializeNodeStatus(nodes);
  /** @type {Record<string, unknown>} */
  const nodeOutputs = {};
  /** @type {Record<string, unknown>} */
  const toolOutputs = {};

  await writeMetadata(mid, {
    executionState: 'running',
    topologyNodeStatus: { ...nodeStatus },
    topologyNodeOutputs: {},
  });

  /** @type {string[]} */
  let failedNodeIds = [];

  while (true) {
    const runnableIds = getRunnableNodeIds(nodes, nodeStatus);
    const pendingCount = Object.values(nodeStatus).filter((s) => s === 'pending').length;

    if (!runnableIds.length) {
      if (pendingCount > 0) {
        for (const [nodeId, status] of Object.entries(nodeStatus)) {
          if (status === 'pending') {
            nodeStatus[nodeId] = 'failed';
            failedNodeIds.push(nodeId);
          }
        }
      }
      break;
    }

    for (const nodeId of runnableIds) {
      const node = nodeById.get(nodeId);
      if (!node) {
        nodeStatus[nodeId] = 'failed';
        failedNodeIds.push(nodeId);
        continue;
      }

      const toolName = String(node.toolName ?? '').trim();
      nodeStatus[nodeId] = 'running';

      await writeMetadata(mid, {
        executionState: 'running',
        topologyNodeStatus: { ...nodeStatus },
        currentTopologyNodeId: nodeId,
      });

      const input = buildNodeInput(toolName, node, executionContext, toolOutputs);
      const result = await dispatchTopologyNode(node, input, { ...executionContext, toolOutputs });
      const status = String(result?.status ?? 'failed').toLowerCase();

      if (status === 'ok') {
        const output = extractToolOutput(result);
        nodeStatus[nodeId] = 'completed';
        if (output) {
          nodeOutputs[nodeId] = output;
          if (toolName) toolOutputs[toolName] = output;
        }
      } else if (status === 'blocked' || status === 'failed') {
        const partial = extractToolOutput(result);
        if (SOFT_FAIL_TOOLS.has(toolName)) {
          nodeStatus[nodeId] = 'skipped';
          if (partial && toolName) {
            toolOutputs[toolName] = partial;
          }
          nodeOutputs[nodeId] = {
            skipped: true,
            reason: result?.reason ?? result?.error?.code ?? status,
            message: result?.message ?? result?.error?.message ?? `${toolName} skipped`,
            partial,
          };
        } else {
          nodeStatus[nodeId] = 'failed';
          failedNodeIds.push(nodeId);
          nodeOutputs[nodeId] = {
            error: result?.error ?? { code: status, message: result?.message ?? `${toolName} failed` },
            partial: extractToolOutput(result),
          };
        }
      } else {
        nodeStatus[nodeId] = 'failed';
        failedNodeIds.push(nodeId);
      }

      await writeMetadata(mid, {
        topologyNodeStatus: { ...nodeStatus },
        topologyNodeOutputs: { ...nodeOutputs },
        topologyToolOutputs: { ...toolOutputs },
      });
    }
  }

  failedNodeIds = [...new Set(failedNodeIds)];
  const completedCount = Object.values(nodeStatus).filter((s) => s === 'completed').length;
  const skippedCount = Object.values(nodeStatus).filter((s) => s === 'skipped').length;
  const finalStatus = failedNodeIds.length ? 'failed' : 'completed';
  const aggregatedOutputs = aggregateTopologyOutputs(toolOutputs);

  await writeMetadata(mid, {
    multiAgentStatus: finalStatus,
    executionState: finalStatus,
    topologyNodeStatus: { ...nodeStatus },
    topologyNodeOutputs: { ...nodeOutputs },
    topologyToolOutputs: { ...toolOutputs },
    executionCompletedAt: new Date().toISOString(),
    executionSummary: {
      totalNodes: nodes.length,
      completedCount,
      skippedCount,
      failedCount: failedNodeIds.length,
      failedNodeIds,
    },
    currentTopologyNodeId: null,
  });

  return {
    ok: failedNodeIds.length === 0,
    status: finalStatus,
    nodeStatus,
    nodeOutputs,
    toolOutputs,
    outputs: aggregatedOutputs,
    failedNodeIds,
    completedCount,
    skippedCount,
  };
}
