/**
 * Architecture dependency graph — Performer path + integration overlay.
 */

import { getComponentStatuses } from './componentStatus.js';
import { getRegistryComponent } from './componentRegistry.js';

/** @typedef {'solid'|'dashed'} GraphEdgeKind */

export const GRAPH_LAYOUT_NODES = [
  { id: 'performer_console', label: 'Performer', group: 'frontend', x: 24, y: 196, w: 96, h: 44 },
  { id: 'safe_execution_governance', label: 'Governance', group: 'execution', x: 148, y: 72, w: 104, h: 40 },
  { id: 'http_api_proxy', label: 'HTTP API', group: 'integration', x: 148, y: 132, w: 96, h: 40 },
  { id: 'sse_streams', label: 'SSE', group: 'integration', x: 148, y: 192, w: 80, h: 40 },
  { id: 'performer_handoff', label: 'Handoff', group: 'integration', x: 148, y: 252, w: 96, h: 40 },
  { id: 'intake_v2', label: 'Intake V2', group: 'intake', x: 280, y: 196, w: 96, h: 44 },
  { id: 'llm_reasoner', label: 'LLMReasoner', group: 'intake', x: 400, y: 108, w: 104, h: 40 },
  { id: 'intent_reasoner', label: 'IntentReasoner', group: 'intake', x: 400, y: 196, w: 112, h: 44 },
  { id: 'react_planner', label: 'ReactPlanner', group: 'intake', x: 536, y: 196, w: 104, h: 44 },
  { id: 'dynamic_planner', label: 'Dyn Planner', group: 'planning', x: 536, y: 108, w: 104, h: 40 },
  { id: 'performer_runtime', label: 'Performer RT', group: 'execution', x: 664, y: 196, w: 104, h: 44 },
  { id: 'runtime_kernel', label: 'Runtime Kernel', group: 'execution', x: 788, y: 196, w: 112, h: 44 },
  { id: 'tool_dispatcher', label: 'Tool Dispatch', group: 'execution', x: 788, y: 280, w: 112, h: 44 },
  { id: 'store_tools', label: 'Store', group: 'tools', x: 664, y: 360, w: 72, h: 36 },
  { id: 'campaign_tools', label: 'Campaign', group: 'tools', x: 748, y: 360, w: 80, h: 36 },
  { id: 'product_tools', label: 'Product', group: 'tools', x: 832, y: 360, w: 72, h: 36 },
  { id: 'skills_api', label: 'Skills', group: 'tools', x: 748, y: 412, w: 72, h: 36 },
  { id: 'context_engine', label: 'Context', group: 'memory', x: 280, y: 360, w: 88, h: 40 },
  { id: 'memory_facade', label: 'Mem Facade', group: 'memory', x: 388, y: 360, w: 96, h: 40 },
  { id: 'episodic_memory', label: 'Episodic', group: 'memory', x: 496, y: 360, w: 88, h: 40 },
  { id: 'memory_store', label: 'Mem Store', group: 'data', x: 388, y: 420, w: 96, h: 40 },
  { id: 'database', label: 'Database', group: 'data', x: 280, y: 420, w: 96, h: 40 },
  { id: 'feedback_capture', label: 'Learning', group: 'learning', x: 496, y: 420, w: 88, h: 40 },
];

export const GRAPH_EDGES = [
  { from: 'performer_console', to: 'http_api_proxy' },
  { from: 'performer_console', to: 'sse_streams' },
  { from: 'performer_console', to: 'safe_execution_governance' },
  { from: 'performer_handoff', to: 'performer_console', kind: 'dashed' },
  { from: 'http_api_proxy', to: 'intake_v2' },
  { from: 'intake_v2', to: 'context_engine' },
  { from: 'intake_v2', to: 'llm_reasoner', kind: 'dashed' },
  { from: 'intake_v2', to: 'intent_reasoner' },
  { from: 'llm_reasoner', to: 'intent_reasoner', kind: 'dashed' },
  { from: 'intent_reasoner', to: 'react_planner' },
  { from: 'intent_reasoner', to: 'feedback_capture', kind: 'dashed' },
  { from: 'react_planner', to: 'dynamic_planner', kind: 'dashed' },
  { from: 'react_planner', to: 'performer_runtime' },
  { from: 'dynamic_planner', to: 'performer_runtime', kind: 'dashed' },
  { from: 'performer_runtime', to: 'runtime_kernel' },
  { from: 'runtime_kernel', to: 'tool_dispatcher' },
  { from: 'safe_execution_governance', to: 'runtime_kernel', kind: 'dashed' },
  { from: 'tool_dispatcher', to: 'store_tools' },
  { from: 'tool_dispatcher', to: 'campaign_tools' },
  { from: 'tool_dispatcher', to: 'product_tools' },
  { from: 'tool_dispatcher', to: 'skills_api' },
  { from: 'context_engine', to: 'intent_reasoner', kind: 'dashed' },
  { from: 'context_engine', to: 'memory_facade' },
  { from: 'memory_facade', to: 'episodic_memory' },
  { from: 'episodic_memory', to: 'memory_store' },
  { from: 'database', to: 'memory_store' },
  { from: 'intake_v2', to: 'database', kind: 'dashed' },
  { from: 'feedback_capture', to: 'intent_reasoner', kind: 'dashed' },
];

export const GRAPH_VIEWBOX = { width: 960, height: 480 };

function resolveNodeStatus(statusById, id) {
  const live = statusById[id];
  if (live) return live;
  const doc = getRegistryComponent(id)?.docStatus;
  if (doc === 'running') return 'running';
  if (doc === 'partial') return 'degraded';
  if (doc === 'placeholder') return 'down';
  return 'degraded';
}

/**
 * @param {{ bypassCache?: boolean }} [options]
 */
export async function getDependencyGraph(options = {}) {
  const statuses = await getComponentStatuses(options);
  const statusById = Object.fromEntries(statuses.map((s) => [s.id, s.status]));
  const nameById = Object.fromEntries(statuses.map((s) => [s.id, s.name]));

  const nodes = GRAPH_LAYOUT_NODES.map((node) => ({
    id: node.id,
    label: node.label,
    name: nameById[node.id] || getRegistryComponent(node.id)?.name || node.label,
    group: node.group,
    status: resolveNodeStatus(statusById, node.id),
    x: node.x,
    y: node.y,
    width: node.w ?? 96,
    height: node.h ?? 40,
  }));

  const edges = GRAPH_EDGES.map((edge) => ({
    from: edge.from,
    to: edge.to,
    kind: edge.kind || 'solid',
  }));

  return {
    timestamp: new Date().toISOString(),
    viewBox: GRAPH_VIEWBOX,
    path: 'performer',
    nodes,
    edges,
  };
}
