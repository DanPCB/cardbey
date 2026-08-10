/**
 * Canonical read/write for MissionPipeline.metadataJson compiler fields.
 */

import { getPrismaClient } from '../prisma.js';
import { Features } from '../../config/features.js';

/** Deprecated when PHASE1_GRAPH_PRIMARY — graph is authoritative. */
const DEPRECATED_GRAPH_METADATA_KEYS = Object.freeze([
  'preseededDraft',
  'attachmentAnalysis',
  'loyaltyProgressiveArtifact',
]);

/**
 * @param {Record<string, unknown>} updates
 */
function stripDeprecatedGraphMetadataKeys(updates) {
  if (!Features.phase1.graphPrimary) return updates;
  const blocked = DEPRECATED_GRAPH_METADATA_KEYS.filter((key) => key in updates);
  if (blocked.length === 0) return updates;
  const out = { ...updates };
  for (const key of blocked) {
    delete out[key];
  }
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      `[metadataWriter] PHASE1_GRAPH_PRIMARY stripped deprecated keys: ${blocked.join(', ')}`,
    );
  }
  return out;
}

/** Keys written by the multi-agent compiler pipeline. */
export const METADATA_KEYS = {
  PENDING_TOPOLOGY: 'pendingTopology',
  PENDING_POLICY: 'pendingPolicy',
  PENDING_REASONING: 'pendingReasoning',
  APPROVED_TOPOLOGY: 'approvedTopology',
  APPROVED_POLICY: 'approvedPolicy',
  APPROVED_REASONING: 'approvedReasoning',
  MULTI_AGENT_STATUS: 'multiAgentStatus',
  APPROVAL_STATUS: 'approvalStatus',
  COMPILED_AT: 'compiledAt',
  COMPILER_VERSION: 'compilerVersion',
  TOPOLOGY_NODE_STATUS: 'topologyNodeStatus',
  TOPOLOGY_NODE_OUTPUTS: 'topologyNodeOutputs',
  TOPOLOGY_TOOL_OUTPUTS: 'topologyToolOutputs',
  EXECUTION_STATE: 'executionState',
};

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
function asMetadataObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(/** @type {Record<string, unknown>} */ (value)) }
    : {};
}

/**
 * @param {string} missionId
 * @param {string} [key]
 * @returns {Promise<unknown>}
 */
export async function readMetadata(missionId, key) {
  const mid = String(missionId ?? '').trim();
  if (!mid) throw new Error('readMetadata requires missionId');

  const prisma = getPrismaClient();
  const row = await prisma.missionPipeline.findUnique({
    where: { id: mid },
    select: { metadataJson: true },
  });

  if (!row) return key ? undefined : {};

  const meta = asMetadataObject(row.metadataJson);
  if (!key) return meta;
  return meta[key];
}

/**
 * Merge updates into MissionPipeline.metadataJson.
 *
 * @param {string} missionId
 * @param {Record<string, unknown>} updates
 * @returns {Promise<Record<string, unknown>>}
 */
export async function writeMetadata(missionId, updates) {
  const mid = String(missionId ?? '').trim();
  if (!mid) throw new Error('writeMetadata requires missionId');
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    throw new Error('writeMetadata requires updates object');
  }

  const sanitizedUpdates = stripDeprecatedGraphMetadataKeys(updates);

  const prisma = getPrismaClient();
  const row = await prisma.missionPipeline.findUnique({
    where: { id: mid },
    select: { metadataJson: true },
  });

  if (!row) throw new Error(`MissionPipeline not found: ${mid}`);

  const nextMeta = {
    ...asMetadataObject(row.metadataJson),
    ...sanitizedUpdates,
    metadataUpdatedAt: new Date().toISOString(),
  };

  await prisma.missionPipeline.update({
    where: { id: mid },
    data: { metadataJson: nextMeta },
  });

  return nextMeta;
}

/**
 * Write pending compiler artifacts for TopologyReviewCard consumption.
 *
 * @param {string} missionId
 * @param {import('../artifact/types.ts').ArtifactBundle} artifactBundle
 * @returns {Promise<Record<string, unknown>>}
 */
export async function writePendingArtifactBundle(missionId, artifactBundle) {
  return writeMetadata(missionId, {
    [METADATA_KEYS.PENDING_TOPOLOGY]: artifactBundle.topology,
    [METADATA_KEYS.PENDING_POLICY]: artifactBundle.policy,
    [METADATA_KEYS.PENDING_REASONING]: artifactBundle.reasoning,
    [METADATA_KEYS.MULTI_AGENT_STATUS]: 'pending_approval',
    [METADATA_KEYS.APPROVAL_STATUS]: 'pending',
    [METADATA_KEYS.COMPILED_AT]: new Date().toISOString(),
    [METADATA_KEYS.COMPILER_VERSION]: artifactBundle.topology.version,
    toolContracts: artifactBundle.toolContracts ?? [],
    // Explicit remount contract for TopologyReviewCard / GET /state consumers.
    action: 'show_execution_plan',
    executionPlan: {
      topology: artifactBundle.topology,
      policy: artifactBundle.policy,
      reasoning: artifactBundle.reasoning,
    },
  });
}

/**
 * Promote pending artifacts to approved after HITL decision.
 *
 * @param {string} missionId
 * @param {{ topology?: unknown, policy?: unknown, reasoning?: unknown }} [overrides]
 */
export async function promotePendingToApproved(missionId, overrides = {}) {
  const meta = asMetadataObject(await readMetadata(missionId));

  return writeMetadata(missionId, {
    [METADATA_KEYS.APPROVED_TOPOLOGY]: overrides.topology ?? meta.pendingTopology,
    [METADATA_KEYS.APPROVED_POLICY]: overrides.policy ?? meta.pendingPolicy,
    [METADATA_KEYS.APPROVED_REASONING]: overrides.reasoning ?? meta.pendingReasoning,
    // Clear pending mirrors so remount/HITL detection cannot re-open Approve after promote.
    [METADATA_KEYS.PENDING_TOPOLOGY]: null,
    [METADATA_KEYS.PENDING_POLICY]: null,
    [METADATA_KEYS.PENDING_REASONING]: null,
    [METADATA_KEYS.MULTI_AGENT_STATUS]: 'approved',
    [METADATA_KEYS.APPROVAL_STATUS]: 'approved',
    approvedAt: new Date().toISOString(),
  });
}

/**
 * Mark plan rejected in metadata.
 *
 * @param {string} missionId
 * @param {string} [reason]
 */
export async function markTopologyRejected(missionId, reason) {
  return writeMetadata(missionId, {
    [METADATA_KEYS.MULTI_AGENT_STATUS]: 'rejected',
    [METADATA_KEYS.APPROVAL_STATUS]: 'rejected',
    rejectionReason: reason ?? 'User rejected plan',
    rejectedAt: new Date().toISOString(),
  });
}
