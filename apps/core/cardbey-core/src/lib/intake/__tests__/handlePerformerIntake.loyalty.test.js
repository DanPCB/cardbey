/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../intent/intentIntegration.js', () => ({
  getIntentIntegration: () => ({
    processIntake: vi.fn(async () => ({
      tool: 'setup_loyalty_program',
      confidence: 0.93,
      executionPath: 'kernel_dispatch',
      parameters: { storeId: 'store_1' },
    })),
  }),
}));

vi.mock('../../context/contextEngine.js', () => ({
  getContextProvider: () => ({}),
}));

vi.mock('../../mission/generateExecutionPlan.js', () => ({
  generateExecutionPlan: vi.fn(async () => ({
    missionId: 'mission_loyalty_spine',
    artifactBundle: {
      topology: {
        id: 'topo_1',
        version: '1',
        missionType: 'setup_loyalty_program',
        nodes: [
          { id: 'segment_1', toolName: 'segment_loyal_customers', orderIndex: 0 },
          { id: 'setup_1', toolName: 'setup_loyalty_program', orderIndex: 1 },
        ],
        edges: [],
      },
      policy: { id: 'pol_1', version: '1', gates: [] },
      reasoning: { id: 'rea_1', version: '1', summary: 'Loyalty plan' },
      toolContracts: [],
    },
    metadata: { multiAgentStatus: 'pending_approval' },
    response: {
      success: true,
      action: 'show_execution_plan',
      missionId: 'mission_loyalty_spine',
      pendingTopology: { nodes: [{ id: 'segment_1' }] },
    },
  })),
}));

vi.mock('../../../config/features.js', () => ({
  Features: { loyalty: { useSpine: true } },
}));

import { handlePerformerIntake } from '../index.js';
import { generateExecutionPlan } from '../../mission/generateExecutionPlan.js';
import { shouldUseMultiAgentCompiler } from '../../mission/intentCompilerBridge.js';

describe('handlePerformerIntake loyalty spine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('classifies loyalty and compiles via generateExecutionPlan', async () => {
    expect(
      shouldUseMultiAgentCompiler({ tool: 'setup_loyalty_program' }),
    ).toBe(true);
    expect(
      shouldUseMultiAgentCompiler({ tool: 'create_loyalty_program' }),
    ).toBe(true);

    const result = await handlePerformerIntake({
      text: 'Setup a loyalty program: create loyalty program — 8 stamps for free coffee. Stamp card.',
      userId: 'user_1',
      storeId: 'store_1',
      files: [{ url: 'https://cdn.example/card.jpg', type: 'image' }],
      parameters: {
        preseededDraft: { requiredStamps: 8, reward: 'Free coffee' },
        source: 'dashboard_loyalty_card_scan',
      },
      pathId: 'loyalty_spine',
      source: 'dashboard_loyalty_card_scan',
    });

    expect(result.ok).toBe(true);
    expect(result.spine).toBe(true);
    expect(result.compiled).toBe(true);
    expect(result.missionId).toBe('mission_loyalty_spine');
    expect(result.tool).toBe('setup_loyalty_program');
    expect(generateExecutionPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        tool: 'setup_loyalty_program',
        text: expect.stringMatching(/loyalty/i),
      }),
      'store_1',
      null,
      expect.objectContaining({ userId: 'user_1' }),
    );
  });
});
