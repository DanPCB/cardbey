/**
 * Shared AgentCoordinator mock for integration tests (avoids LLM/decompose network calls).
 */
import { vi } from 'vitest';

const coordinatorMocks = vi.hoisted(() => ({
  decomposeGoal: vi.fn(async (goal) => [
    {
      taskId: 'brief_1',
      agentType: 'brief',
      description: `Campaign brief: ${String(goal).slice(0, 80)}`,
      dependsOn: [],
    },
    {
      taskId: 'graphics_1',
      agentType: 'graphics',
      description: 'Generate promotional graphics',
      dependsOn: ['brief_1'],
    },
    {
      taskId: 'copy_1',
      agentType: 'copy',
      description: 'Write campaign copy',
      dependsOn: ['brief_1'],
    },
    {
      taskId: 'package_1',
      agentType: 'package',
      description: 'Assemble campaign package',
      dependsOn: ['graphics_1', 'copy_1'],
    },
  ]),
}));

vi.mock('../../lib/orchestration/agentCoordinator.js', () => ({
  AgentCoordinator: class {
    maxAgents = 8;
    decomposeGoal = coordinatorMocks.decomposeGoal;
  },
}));

export function getMockDecomposeGoal() {
  return coordinatorMocks.decomposeGoal;
}

export function resetMockDecomposeGoal() {
  coordinatorMocks.decomposeGoal.mockClear();
}
