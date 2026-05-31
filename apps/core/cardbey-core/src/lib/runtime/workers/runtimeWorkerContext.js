/**
 * Runtime Worker Context — execution scope for graph node workers (Phase D).
 */

import { readRuntimeMissionGraph } from '../runtimeGraphExecutionState.js';
import { readOrchestrationState } from '../runtimeOrchestrationState.js';
import { getRuntimeCapabilities } from '../runtimeCapabilitiesService.js';

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Build durable worker execution context.
 *
 * @param {{
 *   missionId: string;
 *   graphId: string;
 *   node: object;
 *   skill: object;
 *   workerId: string;
 *   leaseId?: string|null;
 *   row?: object|null;
 *   metadataJson?: object;
 *   traceId?: string|null;
 *   requestId?: string|null;
 *   continuationHint?: object|null;
 * }} input
 */
export function createWorkerContext(input) {
  const missionId = str(input.missionId);
  const graphId = str(input.graphId);
  const node = input.node ?? {};
  const skill = input.skill ?? {};
  const meta = asObject(input.metadataJson);
  const graph = readRuntimeMissionGraph(meta);
  const orchestrationState = readOrchestrationState(meta);
  const row = input.row ?? {};

  const parentNodeId = Array.isArray(node.dependencies) ? node.dependencies[0] : null;
  const parentArtifacts = parentNodeId
    ? (graph?.artifactLineage ?? []).filter((r) => r.nodeId === parentNodeId)
    : [];

  return {
    workerId: str(input.workerId),
    leaseId: str(input.leaseId) || null,
    missionId,
    graphId,
    nodeId: str(node.nodeId),
    skillId: skill.skillId ?? null,
    skillType: skill.skillType ?? null,
    assignedTool: str(node.assignedTool) || null,
    assignedAgent: str(node.assignedAgent) || null,
    targetContext: {
      targetId: str(node.targetId) || str(row.targetId) || null,
      targetType: str(node.targetType) || str(row.targetType) || null,
      storeId: str(meta.storeId) || str(row.targetId) || null,
    },
    artifactLineageContext: {
      parentNodeId,
      parentArtifacts,
      graphArtifactCount: graph?.artifactLineage?.length ?? 0,
    },
    runtimeCapabilities: getRuntimeCapabilities(),
    continuationContext: {
      orchestrationState,
      continuationHint: input.continuationHint ?? graph?.orchestrationState?.continuationHint ?? null,
      blockedNodeId: graph?.orchestrationState?.blockedNodeId ?? null,
    },
    executionScope: {
      stepNumber: Math.floor(Number(node.metadata?.stepNumber) || 1),
      parameters: asObject(node.metadata?.parameters),
      traceId: str(input.traceId) || null,
      requestId: str(input.requestId) || null,
    },
    createdAt: new Date().toISOString(),
  };
}

export default {
  createWorkerContext,
};
