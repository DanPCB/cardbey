/**
 * Runtime Mission Graph Service — graph creation, persistence, linear conversion (Phase C).
 */

import { randomUUID } from 'node:crypto';
import {
  EDGE_TYPE,
  EXECUTION_MODE,
  GRAPH_VERSION,
  NODE_STATUS,
  NODE_TYPE,
} from './runtimeGraphTypes.js';
import {
  readRuntimeMissionGraph,
  writeRuntimeMissionGraph,
} from './runtimeGraphExecutionState.js';
import { readProactivePlanSteps, normalizePlanSteps } from './runtimeOrchestrationState.js';
import { getRuntimeCapabilities } from './runtimeCapabilitiesService.js';

export function isRuntimeMissionGraphEnabled() {
  return getRuntimeCapabilities().runtimeMissionGraph === true;
}

/**
 * @param {{
 *   missionId: string;
 *   nodes: object[];
 *   edges: object[];
 *   graphId?: string;
 *   orchestrationState?: object;
 * }} input
 */
export function createMissionGraph(input) {
  const missionId = String(input.missionId ?? '').trim();
  if (!missionId) throw new Error('missionId required');

  const now = new Date().toISOString();
  return {
    graphId: input.graphId || randomUUID(),
    missionId,
    version: GRAPH_VERSION,
    nodes: Array.isArray(input.nodes) ? input.nodes : [],
    edges: Array.isArray(input.edges) ? input.edges : [],
    orchestrationState: input.orchestrationState && typeof input.orchestrationState === 'object'
      ? input.orchestrationState
      : { status: 'idle' },
    artifactLineage: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Convert linear proactive plan into sequential mission graph.
 * @param {string} missionId
 * @param {Array<object>} planSteps
 * @param {{ targetId?: string|null; targetType?: string|null }} [ctx]
 */
export function graphFromLinearPlan(missionId, planSteps, ctx = {}) {
  const steps = normalizePlanSteps(planSteps);
  const nodes = [];
  const edges = [];
  let prevNodeId = null;

  for (const step of steps) {
    const nodeId = `node-step-${step.step}`;
    const executionMode =
      step.executionMode === EXECUTION_MODE.RETRYABLE
        ? EXECUTION_MODE.RETRYABLE
        : EXECUTION_MODE.SEQUENTIAL;

    nodes.push({
      nodeId,
      nodeType: NODE_TYPE.TOOL_STEP,
      label: step.title || `Step ${step.step}`,
      executionMode,
      status: NODE_STATUS.PENDING,
      assignedTool: step.recommendedTool ?? null,
      assignedAgent: null,
      targetId: ctx.targetId ?? null,
      targetType: ctx.targetType ?? null,
      dependencies: prevNodeId ? [prevNodeId] : [],
      outputs: {},
      retries: { count: 0, max: 3 },
      startedAt: null,
      completedAt: null,
      failedAt: null,
      metadata: {
        stepNumber: step.step,
        parameters: step.parameters ?? {},
        source: 'linear_plan_conversion',
      },
    });

    if (prevNodeId) {
      edges.push({
        fromNodeId: prevNodeId,
        toNodeId: nodeId,
        edgeType: EDGE_TYPE.DEPENDS_ON,
      });
    }
    prevNodeId = nodeId;
  }

  return createMissionGraph({ missionId, nodes, edges });
}

/**
 * Build campaign-style graph with parallel fan-out + barrier (for tests / templates).
 * @param {string} missionId
 */
export function buildCampaignGraphTemplate(missionId) {
  const nodes = [
    {
      nodeId: 'node-analyze',
      nodeType: NODE_TYPE.TOOL_STEP,
      label: 'Analyze store',
      executionMode: EXECUTION_MODE.SEQUENTIAL,
      status: NODE_STATUS.PENDING,
      assignedTool: 'analyze_store',
      assignedAgent: null,
      targetId: null,
      targetType: 'store',
      dependencies: [],
      outputs: {},
      retries: { count: 0, max: 3 },
      metadata: { stepNumber: 1 },
    },
    {
      nodeId: 'node-audience',
      nodeType: NODE_TYPE.AGENT,
      label: 'Audience analysis',
      executionMode: EXECUTION_MODE.PARALLEL,
      status: NODE_STATUS.PENDING,
      assignedTool: 'campaign_research',
      assignedAgent: 'audienceAgent',
      dependencies: ['node-analyze'],
      outputs: {},
      retries: { count: 0, max: 2 },
      metadata: { stepNumber: 2, branch: 'parallel' },
    },
    {
      nodeId: 'node-copy',
      nodeType: NODE_TYPE.AGENT,
      label: 'Copy generation',
      executionMode: EXECUTION_MODE.PARALLEL,
      status: NODE_STATUS.PENDING,
      assignedTool: 'create_promotion',
      assignedAgent: 'copyAgent',
      dependencies: ['node-analyze'],
      outputs: {},
      retries: { count: 0, max: 2 },
      metadata: { stepNumber: 3, branch: 'parallel' },
    },
    {
      nodeId: 'node-design',
      nodeType: NODE_TYPE.AGENT,
      label: 'Design direction',
      executionMode: EXECUTION_MODE.PARALLEL,
      status: NODE_STATUS.PENDING,
      assignedTool: 'generate_promotion_asset',
      assignedAgent: 'designAgent',
      dependencies: ['node-analyze'],
      outputs: {},
      retries: { count: 0, max: 2 },
      metadata: { stepNumber: 4, branch: 'parallel' },
    },
    {
      nodeId: 'node-barrier-package',
      nodeType: NODE_TYPE.BARRIER,
      label: 'Campaign package barrier',
      executionMode: EXECUTION_MODE.BARRIER,
      status: NODE_STATUS.PENDING,
      assignedTool: null,
      assignedAgent: null,
      dependencies: ['node-audience', 'node-copy', 'node-design'],
      outputs: {},
      retries: { count: 0, max: 0 },
      metadata: { barrier: 'campaign_package' },
    },
    {
      nodeId: 'node-package',
      nodeType: NODE_TYPE.PACKAGE,
      label: 'Campaign package',
      executionMode: EXECUTION_MODE.SEQUENTIAL,
      status: NODE_STATUS.PENDING,
      assignedTool: 'launch_campaign',
      assignedAgent: null,
      dependencies: ['node-barrier-package'],
      outputs: {},
      retries: { count: 0, max: 3 },
      metadata: { stepNumber: 5 },
    },
  ];

  const edges = [
    { fromNodeId: 'node-analyze', toNodeId: 'node-audience', edgeType: EDGE_TYPE.DEPENDS_ON },
    { fromNodeId: 'node-analyze', toNodeId: 'node-copy', edgeType: EDGE_TYPE.DEPENDS_ON },
    { fromNodeId: 'node-analyze', toNodeId: 'node-design', edgeType: EDGE_TYPE.DEPENDS_ON },
    { fromNodeId: 'node-audience', toNodeId: 'node-barrier-package', edgeType: EDGE_TYPE.BARRIER_JOIN },
    { fromNodeId: 'node-copy', toNodeId: 'node-barrier-package', edgeType: EDGE_TYPE.BARRIER_JOIN },
    { fromNodeId: 'node-design', toNodeId: 'node-barrier-package', edgeType: EDGE_TYPE.BARRIER_JOIN },
    { fromNodeId: 'node-barrier-package', toNodeId: 'node-package', edgeType: EDGE_TYPE.DEPENDS_ON },
  ];

  return createMissionGraph({ missionId, nodes, edges });
}

/**
 * Ensure mission graph exists; auto-convert linear plan when missing.
 * @param {object} metadataJson
 * @param {string} missionId
 * @param {{ planSteps?: object[]; targetId?: string|null; targetType?: string|null }} [opts]
 */
export function ensureMissionGraph(metadataJson, missionId, opts = {}) {
  const existing = readRuntimeMissionGraph(metadataJson);
  if (existing) return { graph: existing, created: false, metadata: metadataJson };

  const planSteps =
    Array.isArray(opts.planSteps) && opts.planSteps.length > 0
      ? opts.planSteps
      : readProactivePlanSteps(metadataJson);

  if (!planSteps.length) {
    return { graph: null, created: false, metadata: metadataJson, error: 'NO_PROACTIVE_PLAN' };
  }

  const graph = graphFromLinearPlan(missionId, planSteps, {
    targetId: opts.targetId ?? null,
    targetType: opts.targetType ?? null,
  });

  const metadata = writeRuntimeMissionGraph(metadataJson, graph);
  return { graph, created: true, metadata };
}

/**
 * @param {object} metadataJson
 * @param {object} graph
 */
export function persistMissionGraph(metadataJson, graph) {
  return writeRuntimeMissionGraph(metadataJson, graph);
}

export default {
  isRuntimeMissionGraphEnabled,
  createMissionGraph,
  graphFromLinearPlan,
  buildCampaignGraphTemplate,
  ensureMissionGraph,
  persistMissionGraph,
  readRuntimeMissionGraph,
};
