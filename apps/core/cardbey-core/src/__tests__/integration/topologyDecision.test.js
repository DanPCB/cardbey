/**
 * @vitest-environment node
 */
import './coordinatorMock.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPrismaClient } from '../../lib/prisma.js';
import { generateExecutionPlan } from '../../lib/mission/generateExecutionPlan.js';
import { handleTopologyDecision } from '../../lib/mission/topologyReviewService.js';
import { readMetadata } from '../../lib/persistence/metadataWriter.js';
import { setupIntegrationTest, teardownIntegrationTest } from './setup.js';

vi.mock('../../services/media/VideoSearchService.js', () => ({
  default: {
    searchAllSources: vi.fn(async () => ({
      results: [
        {
          id: 'media-1',
          source: 'mixkit',
          video_url: 'https://example.com/brunch.mp4',
          thumbnail_url: 'https://example.com/brunch.jpg',
        },
        {
          id: 'media-2',
          source: 'mixkit',
          video_url: 'https://example.com/brunch-2.mp4',
          thumbnail_url: 'https://example.com/brunch-2.jpg',
        },
      ],
    })),
  },
}));

describe('integration: handleTopologyDecision → topologyExecutor', () => {
  /** @type {string[]} */
  const missionIds = [];

  beforeEach(async () => {
    await setupIntegrationTest();
  });

  afterEach(async () => {
    const prisma = getPrismaClient();
    for (const id of missionIds.splice(0, missionIds.length)) {
      await prisma.missionPipelineStep.deleteMany({ where: { missionId: id } }).catch(() => {});
      await prisma.missionPipeline.delete({ where: { id } }).catch(() => {});
    }
    await teardownIntegrationTest();
  });

  async function seedPendingPlan() {
    const result = await generateExecutionPlan(
      { text: 'launch a campaign for my store', tool: 'create_campaign' },
      'store_integration_test',
      'session_integration_test',
      { userId: 'user_integration_test', tenantId: 'tenant_integration_test' },
    );
    missionIds.push(result.missionId);
    return result;
  }

  it('approve triggers topologyExecutor and runs campaign nodes to completion', async () => {
    const seeded = await seedPendingPlan();

    const decision = await handleTopologyDecision(seeded.missionId, {
      decision: 'approve',
      userId: 'user_integration_test',
      storeId: 'store_integration_test',
    });

    expect(decision.ok).toBe(true);
    expect(decision.status).toBe('completed');
    expect(decision.executionMode).toBe('campaign');
    expect(decision.execution?.status).toBe('completed');
    expect(decision.execution?.executionMode).toBe('campaign');
    expect(decision.execution?.nodeCount).toBeGreaterThan(0);
    expect(decision.execution?.nodeRun?.completedCount).toBeGreaterThan(0);

    const metadata = await readMetadata(seeded.missionId);
    expect(metadata.multiAgentStatus).toBe('completed');
    expect(metadata.executionMode).toBe('campaign');
    expect(metadata.executionState).toBe('completed');
    expect(metadata.approvedTopology?.nodes?.length).toBeGreaterThan(0);
    expect(metadata.topologyNodeStatus?.brief_1).toBe('completed');
    expect(metadata.topologyToolOutputs?.create_campaign_brief?.brief?.objective).toBeTruthy();
    expect(metadata.topologyToolOutputs?.package_campaign_artifact?.artifact?.type).toBe('campaign');

    const prisma = getPrismaClient();
    const row = await prisma.missionPipeline.findUnique({ where: { id: seeded.missionId } });
    expect(row?.status).toBe('completed');
    expect(row?.runState).toBe('done');
    expect(row?.outputsJson?.campaignPackage?.type).toBe('campaign');
  });

  it('reject sets multiAgentStatus to rejected', async () => {
    const seeded = await seedPendingPlan();

    const decision = await handleTopologyDecision(seeded.missionId, {
      decision: 'reject',
      reason: 'Plan not suitable',
    });

    expect(decision.ok).toBe(true);
    expect(decision.status).toBe('rejected');

    const metadata = await readMetadata(seeded.missionId);
    expect(metadata.multiAgentStatus).toBe('rejected');
    expect(metadata.approvalStatus).toBe('rejected');
    expect(metadata.rejectionReason).toBe('Plan not suitable');
  });

  it('modify updates pending artifacts and keeps pending_approval status', async () => {
    const seeded = await seedPendingPlan();
    const originalNodeCount = seeded.artifactBundle.topology.nodes.length;

    const modifiedTopology = {
      ...seeded.artifactBundle.topology,
      nodes: seeded.artifactBundle.topology.nodes.slice(0, Math.max(1, originalNodeCount - 1)),
    };
    const modifiedReasoning = {
      ...seeded.artifactBundle.reasoning,
      summary: 'Modified execution plan for review',
    };

    const decision = await handleTopologyDecision(seeded.missionId, {
      decision: 'modify',
      topology: modifiedTopology,
      reasoning: modifiedReasoning,
    });

    expect(decision.ok).toBe(true);
    expect(decision.status).toBe('pending_approval');

    const metadata = await readMetadata(seeded.missionId);
    expect(metadata.multiAgentStatus).toBe('pending_approval');
    expect(metadata.pendingTopology?.nodes?.length).toBe(modifiedTopology.nodes.length);
    expect(metadata.pendingReasoning?.summary).toBe('Modified execution plan for review');
    expect(metadata.modifiedAt).toBeTruthy();
  });
});
