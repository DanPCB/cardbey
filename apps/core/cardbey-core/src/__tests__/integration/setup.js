/**
 * Shared setup for multi-agent compiler integration tests.
 * @vitest-environment node
 */

import { expect } from 'vitest';
import { getPrismaClient } from '../../lib/prisma.js';
import { isRegisteredTool } from '../../lib/intake/intakeToolRegistry.js';

/** @type {string[]} */
const createdMissionIds = [];

export { getMockDecomposeGoal, resetMockDecomposeGoal } from './coordinatorMock.js';

/**
 * Track missions for teardown; disables LLM reasoner for deterministic classification.
 */
export async function setupIntegrationTest() {
  process.env.ENABLE_LLM_REASONER = 'false';
  const { resetMockDecomposeGoal } = await import('./coordinatorMock.js');
  resetMockDecomposeGoal();
}

export async function teardownIntegrationTest() {
  const prisma = getPrismaClient();
  for (const id of createdMissionIds.splice(0, createdMissionIds.length)) {
    await prisma.missionPipelineStep.deleteMany({ where: { missionId: id } }).catch(() => {});
    await prisma.missionPipeline.delete({ where: { id } }).catch(() => {});
  }
}

/**
 * @param {Partial<import('@prisma/client').MissionPipelineCreateInput>} [overrides]
 */
export async function createTestMission(overrides = {}) {
  const prisma = getPrismaClient();
  const mission = await prisma.missionPipeline.create({
    data: {
      type: overrides.type ?? 'launch_campaign',
      title: overrides.title ?? 'Integration test mission',
      targetType: overrides.targetType ?? 'store',
      targetId: overrides.targetId ?? 'store_integration_test',
      tenantId: overrides.tenantId ?? 'tenant_integration_test',
      createdBy: overrides.createdBy ?? 'user_integration_test',
      status: overrides.status ?? 'requested',
      runState: overrides.runState ?? 'idle',
      executionMode: overrides.executionMode ?? 'GUIDED_RUN',
      requiresConfirmation: overrides.requiresConfirmation ?? true,
      metadataJson: overrides.metadataJson ?? {},
    },
  });
  createdMissionIds.push(mission.id);
  return mission;
}

/**
 * @param {string} missionId
 * @param {Record<string, unknown>} metadata
 */
export function buildTopologyReviewViewModel(missionId, metadata) {
  const status = String(metadata.multiAgentStatus ?? '').trim().toLowerCase();
  const approvalStatus = String(metadata.approvalStatus ?? '').trim().toLowerCase();

  if (approvalStatus === 'rejected' || status === 'rejected') {
    return { mode: 'rejected', missionId, canDecide: false };
  }

  if (
    approvalStatus === 'approved' ||
    status === 'approved' ||
    status === 'executing'
  ) {
    const topology = metadata.approvedTopology;
    const reasoning = metadata.approvedReasoning;
    if (!topology?.nodes?.length || !reasoning?.summary) return null;
    return {
      mode: 'approved',
      missionId,
      topology: { nodes: topology.nodes },
      reasoning,
      policy: metadata.approvedPolicy,
      canDecide: false,
    };
  }

  const pending =
    status === 'pending_approval' ||
    approvalStatus === 'pending' ||
    Boolean(metadata.pendingTopology);

  if (pending) {
    const topology = metadata.pendingTopology;
    const reasoning = metadata.pendingReasoning;
    if (!topology?.nodes?.length || !reasoning?.summary) return null;
    return {
      mode: 'pending',
      missionId,
      topology: { nodes: topology.nodes },
      reasoning,
      policy: metadata.pendingPolicy,
      canDecide: true,
    };
  }

  return null;
}

/**
 * @param {import('../../src/lib/artifact/types.ts').TopologyArtifact} topology
 */
export function assertTopologyToolsRegistered(topology) {
  for (const node of topology.nodes) {
    expect(node.toolName).toBeTruthy();
    expect(isRegisteredTool(node.toolName)).toBe(true);
  }
}

export function createMockIntentIntegrationContext(activeStoreId = 'store_integration_test') {
  return {
    activeStoreId,
    activeDraftId: null,
    activeMissionId: null,
    currentWorkflow: null,
    interactions: [],
    preferences: {},
    userId: 'user_integration_test',
    sessionId: 'session_integration_test',
  };
}
