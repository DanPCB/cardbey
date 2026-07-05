/**
 * @vitest-environment node
 */
import './coordinatorMock.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getPrismaClient } from '../../lib/prisma.js';
import { generateExecutionPlan } from '../../lib/mission/generateExecutionPlan.js';
import { validateTopologyArtifact } from '../../lib/artifact/validateTopologyArtifact.js';
import {
  buildTopologyReviewViewModel,
  setupIntegrationTest,
  teardownIntegrationTest,
} from './setup.js';

describe('integration: generateExecutionPlan', () => {
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

  it('creates mission, compiles plan, and returns UI-consumable metadata', async () => {
    const intentText = 'create a weekend brunch promotion campaign for my store';

    const result = await generateExecutionPlan(
      { text: intentText, tool: 'create_campaign' },
      'store_integration_test',
      'session_integration_test',
      {
        userId: 'user_integration_test',
        tenantId: 'tenant_integration_test',
      },
    );

    missionIds.push(result.missionId);

    expect(result.missionId).toBeTruthy();
    expect(result.artifactBundle.topology.nodes.length).toBeGreaterThan(0);
    expect(result.validation.ok).toBe(true);
    expect(result.metadata.pendingTopology).toBeDefined();
    expect(result.response.action).toBe('show_execution_plan');

    const topologyValidation = validateTopologyArtifact(result.artifactBundle.topology);
    expect(topologyValidation.ok).toBe(true);

    const prisma = getPrismaClient();
    const row = await prisma.missionPipeline.findUnique({
      where: { id: result.missionId },
    });

    expect(row).toBeTruthy();
    expect(row?.type).toBe('launch_campaign');
    expect(row?.metadataJson?.pendingTopology?.nodes?.length).toBeGreaterThan(0);
    expect(row?.metadataJson?.multiAgentStatus).toBe('pending_approval');

    const viewModel = buildTopologyReviewViewModel(result.missionId, result.metadata);
    expect(viewModel).not.toBeNull();
    expect(viewModel?.mode).toBe('pending');
    expect(viewModel?.canDecide).toBe(true);
    expect(viewModel?.topology.nodes.length).toBeGreaterThan(0);
    expect(viewModel?.reasoning.summary).toBeTruthy();
  });
});
