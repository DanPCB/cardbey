/**
 * @vitest-environment node
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../config/features.js', () => ({
  Features: {
    loyalty: { useSpine: true },
    compiler: { useForCampaigns: false, useForStores: false },
  },
}));

vi.mock('../generateExecutionPlan.js', () => ({
  generateExecutionPlan: vi.fn(async () => ({
    missionId: 'mission_loyalty_chat',
    artifactBundle: {
      topology: {
        id: 't1',
        version: '1',
        missionType: 'setup_loyalty_program',
        nodes: [{ id: 'setup_1', toolName: 'setup_loyalty_program', orderIndex: 0 }],
        edges: [],
      },
      policy: { id: 'p1', version: '1', gates: [] },
      reasoning: { id: 'r1', version: '1', summary: 'Loyalty plan from chat' },
      toolContracts: [],
    },
    metadata: { multiAgentStatus: 'pending_approval' },
    response: {
      success: true,
      action: 'show_execution_plan',
      missionId: 'mission_loyalty_chat',
      pendingTopology: {
        nodes: [{ id: 'setup_1', toolName: 'setup_loyalty_program' }],
      },
    },
  })),
}));

vi.mock('../../missionAccess.js', () => ({
  getTenantId: () => 'tenant_1',
}));

vi.mock('../../intake/resolveStoreAmbiguity.js', () => ({
  fetchUserStoresForDisambiguation: vi.fn(async () => [
    { id: 'store_1', name: 'Store One', type: 'cafe' },
    { id: 'cmragerp2003tjvikdhczo7ow', name: 'Active Store', type: 'retail' },
    { id: 'store_active', name: 'Active Store 2', type: 'retail' },
  ]),
  validateUserStoreId: vi.fn(async () => true),
}));

import {
  isLoyaltyCompilerTool,
  shouldDispatchLoyaltyViaCompiler,
  runLoyaltyCompilerFromIntake,
} from '../dispatchLoyaltyFromIntake.js';
import { generateExecutionPlan } from '../generateExecutionPlan.js';
import { isLoyaltyIntent } from '../../intake/intentDetectors.js';
import { IntentReasoner } from '../../intent/intentReasoner.js';
import { shouldUseMultiAgentCompiler } from '../intentCompilerBridge.js';

describe('P0 loyalty chat → compiler spine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('isLoyaltyIntent matches create loyalty program without store', () => {
    expect(
      isLoyaltyIntent('create a loyalty program for my store from the uploaded card.'),
    ).toBe(true);
    expect(isLoyaltyIntent('loyalty card rewards')).toBe(true);
  });

  it('IntentReasoner detects setup_loyalty_program without activeStoreId', async () => {
    const reasoner = new IntentReasoner({
      contextProvider: {
        getContext: vi.fn(async () => ({
          activeStoreId: null,
          stores: [],
          memorySummary: null,
        })),
      },
      config: {},
    });

    const result = await reasoner.reason('user_1', 'session_1', {
      text: 'create a loyalty program for my store from the uploaded card.',
    });

    expect(result.intent).toBe('setup_loyalty');
    expect(result.tool).toBe('setup_loyalty_program');
    expect(result.requiresClarification).not.toBe(true);
  });

  it('shouldUseMultiAgentCompiler includes loyalty tools', () => {
    expect(shouldUseMultiAgentCompiler({ tool: 'setup_loyalty_program' })).toBe(true);
    expect(shouldUseMultiAgentCompiler({ tool: 'create_loyalty_program' })).toBe(true);
    expect(isLoyaltyCompilerTool({ tool: 'setup_loyalty_program' })).toBe(true);
    expect(shouldDispatchLoyaltyViaCompiler({ tool: 'setup_loyalty_program' })).toBe(true);
  });

  it('runLoyaltyCompilerFromIntake returns execution_context_required without store hint', async () => {
    const result = await runLoyaltyCompilerFromIntake({
      user: { id: 'user_1' },
      actorId: 'user_1',
      locale: 'en',
      userMessage: 'create a loyalty program',
      classification: { tool: 'setup_loyalty_program', confidence: 0.97, parameters: {} },
      storeId: null,
      auditSource: 'test',
    });
    expect(result.kind).toBe('execution_context_required');
    expect(result.clarify?.clarifyType).toBe('execution_context_store_picker');
    expect(generateExecutionPlan).not.toHaveBeenCalled();
  });

  it('runLoyaltyCompilerFromIntake compiles when store explicitly confirmed', async () => {
    const result = await runLoyaltyCompilerFromIntake({
      user: { id: 'user_1' },
      actorId: 'user_1',
      locale: 'en',
      userMessage: 'create a loyalty program from the uploaded card',
      classification: {
        tool: 'setup_loyalty_program',
        confidence: 0.97,
        parameters: {
          storeId: 'store_1',
          confirmedActiveSpace: true,
          selectionMethod: 'active-space',
        },
      },
      storeId: 'store_1',
      auditSource: 'intake_v2_loyalty_chat_compile',
    });

    expect(result.kind).toBe('compiled');
    expect(result.missionId).toBe('mission_loyalty_chat');
    expect(result.responseBody.action).toBe('show_execution_plan');
    expect(result.responseBody.pathId).toBe('loyalty_chat_compile');
    expect(generateExecutionPlan).toHaveBeenCalled();
  });
});
