/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const decomposeGoalMock = vi.fn(async () => [
  { taskId: 'brief_1', agentType: 'brief', description: 'Campaign brief', dependsOn: [] },
  {
    taskId: 'copy_1',
    agentType: 'copy',
    description: 'Write copy',
    dependsOn: ['brief_1'],
  },
  {
    taskId: 'package_1',
    agentType: 'package',
    description: 'Package campaign',
    dependsOn: ['copy_1'],
  },
]);

vi.mock('../../orchestration/agentCoordinator.js', () => ({
  AgentCoordinator: class {
    maxAgents = 8;
    decomposeGoal = decomposeGoalMock;
  },
}));

const { compileWithMultiAgent } = await import('../../agents/compileWithMultiAgent.js');

describe('compileWithMultiAgent', () => {
  beforeEach(() => {
    decomposeGoalMock.mockClear();
  });

  it('compiles campaign intent into validated ArtifactBundle', async () => {
    const result = await compileWithMultiAgent(
      {
        text: 'create a weekend brunch promotion campaign for my store',
        tool: 'create_campaign',
        storeId: 'store_123',
      },
      {
        missionId: 'mission_test_1',
        storeId: 'store_123',
        sessionId: 'session_1',
        tenantKey: 'tenant_1',
      },
    );

    expect(result.missionId).toBe('mission_test_1');
    expect(result.validation.ok).toBe(true);
    expect(result.artifactBundle.topology.nodes.length).toBe(5);
    expect(result.artifactBundle.topology.nodes.some((n) => n.toolName === 'generate_poster')).toBe(true);
    expect(result.artifactBundle.topology.nodes.some((n) => n.toolName === 'generate_slideshow')).toBe(true);
    expect(result.artifactBundle.reasoning.summary).toMatch(/weekend brunch/i);
    expect(result.artifactBundle.policy.gates.length).toBeGreaterThan(0);
    expect(decomposeGoalMock).toHaveBeenCalled();
  });

  it('throws when missionId is missing', async () => {
    await expect(
      compileWithMultiAgent(
        { text: 'launch campaign', tool: 'create_campaign' },
        { missionId: '' },
      ),
    ).rejects.toThrow(/missionId/);
  });

  it('uses default campaign tasks when decompose returns empty', async () => {
    decomposeGoalMock.mockResolvedValueOnce([]);
    const result = await compileWithMultiAgent(
      { text: 'launch campaign', tool: 'create_campaign', storeId: 'store_abc' },
      { missionId: 'm1', storeId: 'store_abc' },
    );
    expect(result.artifactBundle.topology.nodes.length).toBeGreaterThanOrEqual(6);
    expect(result.artifactBundle.topology.nodes.some((n) => n.toolName === 'generate_poster')).toBe(true);
  });

  it('skips poster step when no storeId', async () => {
    const result = await compileWithMultiAgent(
      { text: 'launch campaign', tool: 'create_campaign' },
      { missionId: 'm2' },
    );
    expect(result.artifactBundle.topology.nodes.some((n) => n.toolName === 'generate_poster')).toBe(false);
  });
});
