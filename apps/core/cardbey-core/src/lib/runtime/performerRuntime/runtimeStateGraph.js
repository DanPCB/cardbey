/**
 * Performer Runtime — execution state graph (Phase 1.5-E).
 * Prepares ActionGraph / OutcomeGraph evolution.
 */

import { randomUUID } from 'node:crypto';

/**
 * @typedef {'action'|'capability'|'artifact'|'telemetry'|'outcome'|'mission'} RuntimeGraphNodeKind
 */

/**
 * @param {import('./runtimeContext.js').PerformerRuntimeContext} ctx
 * @param {{
 *   kind: RuntimeGraphNodeKind;
 *   refId: string;
 *   label?: string;
 *   meta?: object;
 * }} node
 */
export function addRuntimeGraphNode(ctx, node) {
  const graph = ctx.actionGraph && typeof ctx.actionGraph === 'object'
    ? ctx.actionGraph
    : { version: 'runtime_v1', nodes: [], edges: [] };

  const nodes = Array.isArray(graph.nodes) ? [...graph.nodes] : [];
  const id = `node:${node.kind}:${node.refId}`;
  if (!nodes.some((n) => n.id === id)) {
    nodes.push({
      id,
      kind: node.kind,
      refId: node.refId,
      label: node.label ?? node.refId,
      meta: node.meta ?? {},
      createdAt: new Date().toISOString(),
    });
  }

  return {
    ...ctx,
    actionGraph: { ...graph, nodes, edges: Array.isArray(graph.edges) ? [...graph.edges] : [] },
  };
}

/**
 * @param {import('./runtimeContext.js').PerformerRuntimeContext} ctx
 * @param {{ fromRefId: string, fromKind: RuntimeGraphNodeKind, toRefId: string, toKind: RuntimeGraphNodeKind, relation?: string }} edge
 */
export function addRuntimeGraphEdge(ctx, edge) {
  const graph = ctx.actionGraph ?? { version: 'runtime_v1', nodes: [], edges: [] };
  const edges = Array.isArray(graph.edges) ? [...graph.edges] : [];
  const fromId = `node:${edge.fromKind}:${edge.fromRefId}`;
  const toId = `node:${edge.toKind}:${edge.toRefId}`;
  const edgeId = `edge:${fromId}->${toId}:${edge.relation ?? 'executes'}`;
  if (!edges.some((e) => e.id === edgeId)) {
    edges.push({
      id: edgeId,
      from: fromId,
      to: toId,
      relation: edge.relation ?? 'executes',
      createdAt: new Date().toISOString(),
    });
  }
  return { ...ctx, actionGraph: { ...graph, edges } };
}

/**
 * Record an execution node on runtime context + graph.
 *
 * @param {import('./runtimeContext.js').PerformerRuntimeContext} ctx
 * @param {{
 *   actionId: string;
 *   capabilityId?: string|null;
 *   status: string;
 *   executionId?: string;
 *   latencyMs?: number;
 *   artifactRefs?: string[];
 *   error?: string|null;
 * }} record
 */
export function recordRuntimeExecutionNode(ctx, record) {
  const executionId = record.executionId ?? randomUUID();
  const node = {
    executionId,
    actionId: record.actionId,
    capabilityId: record.capabilityId ?? null,
    status: record.status,
    latencyMs: record.latencyMs ?? null,
    artifactRefs: record.artifactRefs ?? [],
    error: record.error ?? null,
    at: new Date().toISOString(),
  };

  let next = {
    ...ctx,
    executionNodes: [...ctx.executionNodes, node],
    executionHistory: [
      ...ctx.executionHistory,
      { executionId, actionId: record.actionId, status: record.status, at: node.at },
    ],
  };

  next = addRuntimeGraphNode(next, {
    kind: 'action',
    refId: record.actionId,
    label: record.actionId,
  });
  if (record.capabilityId) {
    next = addRuntimeGraphNode(next, {
      kind: 'capability',
      refId: record.capabilityId,
    });
    next = addRuntimeGraphEdge(next, {
      fromKind: 'capability',
      fromRefId: record.capabilityId,
      toKind: 'action',
      toRefId: record.actionId,
      relation: 'routes_to',
    });
  }
  for (const ref of record.artifactRefs ?? []) {
    next = addRuntimeGraphNode(next, { kind: 'artifact', refId: ref });
    next = addRuntimeGraphEdge(next, {
      fromKind: 'action',
      fromRefId: record.actionId,
      toKind: 'artifact',
      toRefId: ref,
      relation: 'produces',
    });
  }

  return next;
}
