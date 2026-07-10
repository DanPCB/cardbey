import { describe, expect, it } from 'vitest';
import { resolveTopologyExecutionMode, ensureMissionReadyForTopologyExecution, canReopenCompletedTopologyMission } from '../topologyExecutor.js';
import { canTransitionMissionPipeline } from '../../missionPipelineTransitions.js';

describe('resolveTopologyExecutionMode', () => {
  it('maps launch_campaign to campaign mode', () => {
    expect(resolveTopologyExecutionMode('launch_campaign')).toBe('campaign');
  });

  it('maps store_creation_workflow to store mode', () => {
    expect(resolveTopologyExecutionMode('store_creation_workflow')).toBe('store');
  });

  it('uses compiler tool hint from metadata', () => {
    expect(resolveTopologyExecutionMode(null, { tool: 'create_campaign' })).toBe('campaign');
  });

  it('maps setup_loyalty_program to loyalty mode', () => {
    expect(resolveTopologyExecutionMode('setup_loyalty_program')).toBe('loyalty');
    expect(
      resolveTopologyExecutionMode(null, { source: 'dashboard_loyalty_card_scan' }),
    ).toBe('loyalty');
  });

  it('defaults unknown types to generic', () => {
    expect(resolveTopologyExecutionMode('custom_mission')).toBe('generic');
  });
});

describe('ensureMissionReadyForTopologyExecution', () => {
  it('allows awaiting_confirmation to queued to executing transitions', () => {
    expect(canTransitionMissionPipeline('awaiting_confirmation', 'queued')).toBe(true);
    expect(canTransitionMissionPipeline('queued', 'executing')).toBe(true);
    expect(canTransitionMissionPipeline('executing', 'completed')).toBe(true);
    expect(canTransitionMissionPipeline('executing', 'failed')).toBe(true);
    expect(canTransitionMissionPipeline('executing', 'awaiting_owner_input')).toBe(true);
    expect(canTransitionMissionPipeline('awaiting_owner_input', 'executing')).toBe(true);
    expect(canTransitionMissionPipeline('failed', 'queued')).toBe(true);
  });

  it('rejects invalid direct awaiting_confirmation to executing transition', () => {
    expect(canTransitionMissionPipeline('awaiting_confirmation', 'executing')).toBe(false);
  });
});

describe('canReopenCompletedTopologyMission', () => {
  it('returns true when completed mission still has pending topology awaiting approval', () => {
    expect(
      canReopenCompletedTopologyMission({
        multiAgentStatus: 'pending_approval',
        approvalStatus: 'pending',
        pendingTopology: { nodes: [{ id: 'n1' }] },
      }),
    ).toBe(true);
  });

  it('returns true after promote to approved but before execution starts', () => {
    expect(
      canReopenCompletedTopologyMission({
        multiAgentStatus: 'approved',
        approvalStatus: 'approved',
        pendingTopology: { nodes: [{ id: 'n1' }] },
      }),
    ).toBe(true);
  });

  it('returns false for completed missions without pending topology', () => {
    expect(
      canReopenCompletedTopologyMission({
        multiAgentStatus: 'completed',
        pendingTopology: null,
      }),
    ).toBe(false);
  });
});
