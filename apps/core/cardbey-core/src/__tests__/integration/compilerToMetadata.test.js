/**
 * @vitest-environment node
 */
import './coordinatorMock.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getPrismaClient } from '../../lib/prisma.js';
import { compileWithMultiAgent } from '../../lib/agents/compileWithMultiAgent.js';
import {
  readMetadata,
  writePendingArtifactBundle,
  METADATA_KEYS,
} from '../../lib/persistence/metadataWriter.js';
import { createTestMission, setupIntegrationTest, teardownIntegrationTest } from './setup.js';

describe('integration: compileWithMultiAgent → writeMetadata', () => {
  beforeEach(async () => {
    await setupIntegrationTest();
  });

  afterEach(async () => {
    await teardownIntegrationTest();
  });

  it('persists pending topology, policy, and reasoning to MissionPipeline.metadataJson', async () => {
    const mission = await createTestMission();
    const intentText = 'create a weekend brunch promotion campaign for my store';

    const compileResult = await compileWithMultiAgent(
      {
        text: intentText,
        tool: 'create_campaign',
        storeId: 'store_integration_test',
      },
      {
        missionId: mission.id,
        sessionId: 'session_integration_test',
        storeId: 'store_integration_test',
        tenantKey: 'tenant_integration_test',
      },
    );

    const metadata = await writePendingArtifactBundle(
      mission.id,
      compileResult.artifactBundle,
    );

    expect(metadata[METADATA_KEYS.PENDING_TOPOLOGY]?.nodes?.length).toBeGreaterThan(0);
    expect(Array.isArray(metadata[METADATA_KEYS.PENDING_POLICY]?.gates)).toBe(true);
    expect(typeof metadata[METADATA_KEYS.PENDING_REASONING]?.summary).toBe('string');
    expect(metadata[METADATA_KEYS.MULTI_AGENT_STATUS]).toBe('pending_approval');

    const prisma = getPrismaClient();
    const row = await prisma.missionPipeline.findUnique({
      where: { id: mission.id },
      select: { metadataJson: true },
    });

    const persisted = /** @type {Record<string, unknown>} */ (row?.metadataJson ?? {});
    expect(persisted.pendingTopology?.nodes?.length).toBeGreaterThan(0);
    expect(persisted.pendingPolicy?.gates).toBeDefined();
    expect(persisted.pendingReasoning?.summary).toBeTruthy();
    expect(persisted.multiAgentStatus).toBe('pending_approval');

    const pendingTopology = await readMetadata(mission.id, 'pendingTopology');
    const pendingPolicy = await readMetadata(mission.id, 'pendingPolicy');
    const pendingReasoning = await readMetadata(mission.id, 'pendingReasoning');

    expect(pendingTopology?.nodes?.length).toBeGreaterThan(0);
    expect(pendingPolicy?.gates).toBeDefined();
    expect(pendingReasoning?.summary).toBeTruthy();
  });
});
