/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { buildMissionExecutionOutcome } from '../missionExecutionOutcome.js';
import { reconcileMissionOutcome, validateMissionExecutionOutcome } from '../missionValidator.js';

const loyaltyArtifact = {
  id: 'art_1',
  type: 'generated_loyalty_program',
  subtype: 'loyalty',
  status: 'awaiting_owner_review',
  payload: { reward: 'Free coffee', loyaltyProgramId: 'lp_1' },
};

function loyaltyNodeRun(overrides = {}) {
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
      'loyalty.present_review': { artifact: loyaltyArtifact, artifacts: [loyaltyArtifact] },
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
  nodes: Object.keys(loyaltyNodeRun().nodeStatus).map((id) => ({ id, required: true })),
  completionCriteria: {
    requiredArtifacts: [{ type: 'generated_loyalty_program', mandatory: true }],
    requiredPersistedRecords: [{ type: 'loyalty_program_draft', mandatory: true }],
  },
};

describe('missionExecutionOutcome', () => {
  it('returns completed outcome when nodes and mandatory criteria are satisfied', () => {
    const outcome = buildMissionExecutionOutcome({
      nodeRun: loyaltyNodeRun(),
      topology: loyaltyTopology,
      missionContract: loyaltyContract,
      metadata: { loyaltyProgramDraftArtifact: loyaltyArtifact },
      outputsJson: loyaltyNodeRun().outputs,
    });

    expect(outcome.status).toBe('completed');
    expect(outcome.errors).toHaveLength(0);
    expect(outcome.artifacts.length).toBeGreaterThan(0);
    expect(outcome.persistedEntities.some((e) => e.type === 'loyalty_program_draft')).toBe(true);
    expect(validateMissionExecutionOutcome(outcome).ok).toBe(true);
  });

  it('returns blocked outcome for awaiting_owner_input without treating as failed', () => {
    const outcome = buildMissionExecutionOutcome({
      nodeRun: {
        status: 'awaiting_owner_input',
        nodeStatus: { loyalty_infer_requirements: 'needs_input' },
        missingFields: ['reward'],
        pendingNodeId: 'loyalty_infer_requirements',
        outputs: {},
        toolOutputs: {},
      },
      topology: loyaltyTopology,
      missionContract: loyaltyContract,
      metadata: {},
      outputsJson: {},
    });

    expect(outcome.status).toBe('blocked');
    expect(outcome.blocker?.type).toBe('owner_input_required');
    expect(validateMissionExecutionOutcome(outcome).ok).toBe(true);
  });

  it('emits warning (not failure) for missing optional artifact when nodes completed', () => {
    const outcome = buildMissionExecutionOutcome({
      nodeRun: loyaltyNodeRun(),
      topology: {
        ...loyaltyTopology,
        completionCriteria: {
          requiredArtifacts: [
            { type: 'generated_loyalty_program', mandatory: true },
            { type: 'poster', mandatory: false },
          ],
        },
      },
      missionContract: loyaltyContract,
      metadata: {},
      outputsJson: loyaltyNodeRun().outputs,
    });

    expect(outcome.status).toBe('completed');
    expect(outcome.warnings.some((w) => w.code === 'ARTIFACT_INCOMPLETE')).toBe(true);
  });

  it('fails with structured error when mandatory artifact is missing', () => {
    const outcome = buildMissionExecutionOutcome({
      nodeRun: {
        status: 'completed',
        nodeStatus: { loyalty_present_review: 'completed' },
        outputs: {},
        toolOutputs: {},
      },
      topology: {
        nodes: [{ id: 'loyalty_present_review' }],
        completionCriteria: {
          requiredArtifacts: [{ type: 'generated_loyalty_program', mandatory: true }],
          requiredPersistedRecords: [],
        },
      },
      missionContract: loyaltyContract,
      metadata: {},
      outputsJson: {},
    });

    expect(outcome.status).toBe('failed');
    expect(outcome.errors.some((e) => e.code === 'MANDATORY_ARTIFACT_MISSING')).toBe(true);
    expect(validateMissionExecutionOutcome(outcome).ok).toBe(true);
  });
});

describe('missionValidator reconcileMissionOutcome', () => {
  it('reconciles false artifact failure when criteria evidence exists', () => {
    const failed = buildMissionExecutionOutcome({
      nodeRun: {
        status: 'completed',
        nodeStatus: { loyalty_present_review: 'completed' },
        outputs: { artifacts: [loyaltyArtifact], loyaltyProgramId: 'lp_1' },
        toolOutputs: {
          'loyalty.present_review': { artifact: loyaltyArtifact },
          'loyalty.persist_draft': { loyaltyProgramId: 'lp_1' },
        },
      },
      topology: {
        nodes: [{ id: 'loyalty_present_review' }],
        completionCriteria: {
          requiredArtifacts: [{ type: 'generated_loyalty_program', mandatory: true }],
          requiredPersistedRecords: [],
        },
      },
      missionContract: { missionFamily: 'loyalty', expectedAssetTypes: ['generated_loyalty_program'] },
      metadata: { loyaltyProgramDraftArtifact: loyaltyArtifact },
      outputsJson: {},
    });

    const reconciled = reconcileMissionOutcome({
      ...failed,
      status: 'failed',
      errors: [{ code: 'MANDATORY_ARTIFACT_MISSING', message: 'Required artifact missing' }],
      criteriaEvaluation: { satisfied: true },
      artifacts: [{ id: 'art_1', type: 'generated_loyalty_program' }],
    });

    expect(reconciled.status).toBe('completed');
    expect(reconciled.reconciled).toBe(true);
  });
});
