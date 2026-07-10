/**
 * @vitest-environment node
 *
 * Upload card → infer needs reward+threshold → owner answers → resume → completed spine.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const writeMetadata = vi.fn(async () => ({}));
const emitTopologyBlackboardEvent = vi.fn(async () => {});

vi.mock('../../persistence/metadataWriter.js', () => ({
  writeMetadata: (...args) => writeMetadata(...args),
  readMetadata: vi.fn(async () => ({})),
}));

const broadcastMissionArtifact = vi.fn();
vi.mock('../../../realtime/simpleSse.js', () => ({
  broadcastMissionArtifact: (...args) => broadcastMissionArtifact(...args),
}));

vi.mock('../topologyExecutionTelemetry.js', () => ({
  recordTopologyNodeEvent: vi.fn(async () => {}),
  resolveTopologyNodeLabel: (node, toolName) =>
    node?.labels?.en || node?.label || toolName || 'Step',
  normalizeTopologyError: (err) => ({
    message: err?.message ?? String(err ?? 'error'),
    code: err?.code,
  }),
  emitTopologyBlackboardEvent: (...args) => emitTopologyBlackboardEvent(...args),
  emitTopologyReasoningLine: vi.fn(),
  appendExecutionTimeline: vi.fn(async () => {}),
}));

const capturedInputs = [];

vi.mock('../../toolExecutors/index.js', async () => {
  const { LOYALTY_STAGE_EXECUTORS } = await import('../../toolExecutors/loyalty/loyaltyStageHandlers.js');
  return {
    getExecutor: (toolName) => {
      if (toolName === 'loyalty.load_store_context') {
        return {
          execute: async (input) => ({
            status: 'ok',
            output: {
              storeContext: {
                storeId: input.storeId ?? 'store_1',
                name: 'Demo Café',
                storeName: 'Demo Café',
                businessCategory: 'Cafe',
                category: 'Cafe',
                customerCount: 5,
                products: [],
              },
            },
          }),
        };
      }
      const stage = LOYALTY_STAGE_EXECUTORS[toolName];
      if (!stage) return null;
      return {
        execute: async (input, context) => {
          capturedInputs.push({ toolName, input, context });
          return stage.execute(input, {
            ...context,
            stepOutputs: context.toolOutputs ?? context.stepOutputs ?? {},
          });
        },
      };
    },
  };
});

vi.mock('../topologyCampaignInputs.js', () => ({
  buildCampaignNodeInput: () => ({}),
}));

import { buildLoyaltyProgramTopology } from '../loyaltyTopologyBuilder.js';
import { runTopologyNodes } from '../topologyNodeRunner.js';
import { computeMissingFields } from '../topologyExecutionDraft.js';

const STALE_ATTACHMENT = {
  artifactType: 'loyalty_card',
  missingFields: ['reward', 'stampThreshold'],
  preseededDraft: {},
  ocrText: 'STAMP CARD',
};

describe('loyalty owner-input resume full flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedInputs.length = 0;
  });

  it('pauses once for owner input then completes generate → validate → persist → present_review', async () => {
    const { topology } = buildLoyaltyProgramTopology({
      storeId: 'store_1',
      attachmentAnalysis: STALE_ATTACHMENT,
    });

    const baseContext = {
      executionMode: 'loyalty',
      storeId: 'store_1',
      goal: 'create a loyalty program from this card',
      attachmentAnalysis: STALE_ATTACHMENT,
    };

    const phase1 = await runTopologyNodes('mission_loyalty_e2e', topology, {
      ...baseContext,
      missionId: 'mission_loyalty_e2e',
    });

    expect(phase1.status).toBe('awaiting_owner_input');
    expect(phase1.pendingNodeId).toBe('loyalty_infer_requirements');
    expect(phase1.missingFields).toEqual(expect.arrayContaining(['reward', 'stampThreshold']));

    const ownerInputCalls = emitTopologyBlackboardEvent.mock.calls.filter(
      ([, event]) => event === 'owner_input_requested',
    );
    expect(ownerInputCalls).toHaveLength(1);

    const ownerInput = { reward: 'Free coffee', stampThreshold: 6 };
    const executionDraft = {
      reward: 'Free coffee',
      stampThreshold: 6,
      requiredStamps: 6,
    };
    expect(computeMissingFields(executionDraft)).toEqual([]);

    const phase2 = await runTopologyNodes(
      'mission_loyalty_e2e',
      topology,
      {
        ...baseContext,
        ownerInput,
        executionDraft,
        missionId: 'mission_loyalty_e2e',
      },
      {
        resumeFrom: 'loyalty_infer_requirements',
        priorNodeStatus: phase1.nodeStatus,
        priorNodeOutputs: phase1.nodeOutputs,
        priorToolOutputs: phase1.toolOutputs,
      },
    );

    expect(phase2.status).toBe('completed');
    expect(phase2.failedNodeIds).toEqual([]);
    expect(phase2.outputs?.artifacts?.[0]?.type).toBe('generated_loyalty_program');
    expect(phase2.outputs?.loyaltyProgramDraftArtifact?.payload?.reward).toBe('Free coffee');
    expect(broadcastMissionArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        missionId: 'mission_loyalty_e2e',
        subtype: 'generated_loyalty_program',
      }),
    );

    const ownerInputCallsAfterResume = emitTopologyBlackboardEvent.mock.calls.filter(
      ([, event]) => event === 'owner_input_requested',
    );
    expect(ownerInputCallsAfterResume).toHaveLength(1);

    const completedIds = Object.entries(phase2.nodeStatus)
      .filter(([, s]) => s === 'completed')
      .map(([id]) => id);
    expect(completedIds).toEqual(
      expect.arrayContaining([
        'loyalty_infer_requirements',
        'loyalty_generate_draft',
        'loyalty_validate_draft',
        'loyalty_persist_draft',
        'loyalty_present_review',
      ]),
    );

    const downstreamTools = [
      'loyalty.infer_requirements',
      'loyalty.generate_draft',
      'loyalty.validate_draft',
      'loyalty.persist_draft',
      'loyalty.present_review',
    ];
    for (const toolName of downstreamTools) {
      const calls = capturedInputs.filter((c) => c.toolName === toolName);
      expect(calls.length).toBeGreaterThan(0);
      const lastCall = calls[calls.length - 1];
      const draft = lastCall.input.executionDraft ?? lastCall.context.executionDraft;
      expect(draft?.reward).toBe('Free coffee');
      expect(draft?.stampThreshold ?? draft?.requiredStamps).toBe(6);
    }

    const inferCalls = capturedInputs.filter((c) => c.toolName === 'loyalty.infer_requirements');
    const postResumeInfer = inferCalls[inferCalls.length - 1];
    expect(postResumeInfer.input.executionDraft?.stampThreshold ?? postResumeInfer.input.executionDraft?.requiredStamps).toBe(6);

    const generateCall = capturedInputs.find((c) => c.toolName === 'loyalty.generate_draft');
    expect(generateCall).toBeTruthy();
    const generatedDraft = generateCall?.input?.executionDraft;
    if (generatedDraft) {
      expect(generatedDraft.stampThreshold ?? generatedDraft.requiredStamps).toBe(6);
    }
  });
});
