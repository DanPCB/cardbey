/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { resolveTopologyExecutionOutcome } from '../topologyExecutionOutcome.js';

const loyaltyArtifact = {
  id: 'art_1',
  type: 'generated_loyalty_program',
  subtype: 'loyalty',
  status: 'awaiting_owner_review',
  payload: { reward: 'Free coffee', loyaltyProgramId: 'lp_1' },
};

function completedLoyaltyNodeRun(overrides = {}) {
  return {
    status: 'completed',
    nodeStatus: {
      loyalty_load_store: 'completed',
      loyalty_analyze_card: 'completed',
      loyalty_infer_requirements: 'completed',
      loyalty_generate_draft: 'completed',
      loyalty_validate_draft: 'completed',
      loyalty_persist_draft: 'completed',
      loyalty_present_review: 'completed',
    },
    outputs: {
      loyaltyProgramDraftArtifact: loyaltyArtifact,
      artifacts: [loyaltyArtifact],
      loyaltyProgramId: 'lp_1',
    },
    toolOutputs: {
      'loyalty.present_review': {
        artifact: loyaltyArtifact,
        artifacts: [loyaltyArtifact],
      },
      'loyalty.persist_draft': { loyaltyProgramId: 'lp_1' },
    },
    ...overrides,
  };
}

const loyaltyContract = {
  missionFamily: 'loyalty',
  expectedAssetTypes: ['generated_loyalty_program'],
};

const loyaltyTopology = {
  id: 'loyalty_topology_test',
  nodes: Object.keys(completedLoyaltyNodeRun().nodeStatus).map((id) => ({ id })),
  completionCriteria: {
    requiredArtifacts: [{ type: 'generated_loyalty_program', mandatory: true }],
    requiredPersistedRecords: [{ type: 'loyalty_program_draft', mandatory: true }],
  },
};

describe('resolveTopologyExecutionOutcome', () => {
  it('marks loyalty mission completed when draft artifact exists (subtype loyalty)', () => {
    const outcome = resolveTopologyExecutionOutcome({
      nodeRun: completedLoyaltyNodeRun(),
      missionContract: loyaltyContract,
      topology: loyaltyTopology,
      metadata: {},
      outputsJson: completedLoyaltyNodeRun().outputs,
    });

    expect(outcome.pipelineStatus).toBe('completed');
    expect(outcome.missionOutcome.status).toBe('completed');
    expect(outcome.artifactAuthority.satisfied).toBe(true);
    expect(outcome.failureReason).toBeUndefined();
    expect(outcome.validation.ok).toBe(true);
  });

  it('succeeds when reasoning log is absent and required outputs exist', () => {
    const outcome = resolveTopologyExecutionOutcome({
      nodeRun: completedLoyaltyNodeRun(),
      missionContract: loyaltyContract,
      topology: loyaltyTopology,
      metadata: { reasoningLog: undefined, rawContextType: undefined },
      outputsJson: {},
    });

    expect(outcome.pipelineStatus).toBe('completed');
  });

  it('fails loyalty mission with structured reason when draft artifact is missing', () => {
    const outcome = resolveTopologyExecutionOutcome({
      nodeRun: {
        status: 'completed',
        nodeStatus: { loyalty_present_review: 'completed' },
        outputs: {},
        toolOutputs: {},
      },
      missionContract: loyaltyContract,
      topology: {
        nodes: [{ id: 'loyalty_present_review' }],
        completionCriteria: {
          requiredArtifacts: [{ type: 'generated_loyalty_program', mandatory: true }],
          requiredPersistedRecords: [],
        },
      },
      metadata: {},
      outputsJson: {},
    });

    expect(outcome.pipelineStatus).toBe('failed');
    expect(outcome.failureReason).toBe('MANDATORY_ARTIFACT_MISSING');
  });

  it('maps awaiting_owner_input to blocked pipeline status', () => {
    const outcome = resolveTopologyExecutionOutcome({
      nodeRun: {
        status: 'awaiting_owner_input',
        nodeStatus: {},
        outputs: {},
        toolOutputs: {},
        missingFields: ['reward'],
      },
      missionContract: loyaltyContract,
      topology: loyaltyTopology,
      metadata: {},
      outputsJson: {},
    });

    expect(outcome.pipelineStatus).toBe('awaiting_owner_input');
    expect(outcome.missionOutcome.status).toBe('blocked');
  });
});
