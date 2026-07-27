/**
 * Graph artifact lineage — attach outputs to graph nodes (Phase C).
 */

import { randomUUID } from 'node:crypto';
import { patchGraphNode } from './runtimeGraphExecutionState.js';

export function attachArtifactToGraphNode(graph, input) {
  const nodeId = String(input.nodeId ?? '').trim();
  const artifactRef = String(input.artifactRef ?? '').trim();
  if (!nodeId || !artifactRef) return graph;

  const existingLineage = graph.artifactLineage ?? [];
  if (existingLineage.some((r) => r.nodeId === nodeId && r.artifactRef === artifactRef)) {
    return graph;
  }

  const node = graph.nodes.find((n) => n.nodeId === nodeId);
  const existingArtifacts = Array.isArray(node?.outputs?.artifacts) ? node.outputs.artifacts : [];
  if (existingArtifacts.some((r) => r.artifactRef === artifactRef)) {
    return graph;
  }

  const record = {
    lineageId: randomUUID(),
    missionId: graph.missionId,
    graphId: graph.graphId,
    nodeId,
    workerId: input.workerId ?? null,
    skillId: input.skillId ?? null,
    artifactRef,
    artifactType: input.artifactType ?? 'unknown',
    targetId: input.targetId ?? null,
    parentLineage: input.parentLineage ?? null,
    attachedAt: new Date().toISOString(),
    metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
  };

  const nextGraph = patchGraphNode(graph, nodeId, {
    outputs: {
      artifacts: [...existingArtifacts, record],
      lastArtifactRef: artifactRef,
    },
  });

  return {
    ...nextGraph,
    artifactLineage: [...(graph.artifactLineage ?? []), record],
  };
}

export function listNodeArtifactLineage(graph, nodeId) {
  const id = String(nodeId ?? '').trim();
  return (graph.artifactLineage ?? []).filter((r) => r.nodeId === id);
}

export default {
  attachArtifactToGraphNode,
  listNodeArtifactLineage,
};
