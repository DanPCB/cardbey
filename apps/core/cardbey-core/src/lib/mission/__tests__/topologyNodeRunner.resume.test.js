/**
 * @vitest-environment node
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const writeMetadata = vi.fn(async () => ({}));
const recordTopologyNodeEvent = vi.fn(async () => {});
const emitTopologyBlackboardEvent = vi.fn(async () => {});
const emitTopologyReasoningLine = vi.fn();
const appendExecutionTimeline = vi.fn(async () => {});

const executeFn = vi.fn();

vi.mock('../../persistence/metadataWriter.js', () => ({
  writeMetadata: (...args) => writeMetadata(...args),
  readMetadata: vi.fn(async () => ({})),
}));

vi.mock('../topologyExecutionTelemetry.js', () => ({
  recordTopologyNodeEvent: (...args) => recordTopologyNodeEvent(...args),
  resolveTopologyNodeLabel: (node, toolName) =>
    node?.labels?.en || node?.label || toolName || 'Step',
  normalizeTopologyError: (err) => ({
    message: err?.message ?? String(err ?? 'error'),
    code: err?.code,
  }),
  emitTopologyBlackboardEvent: (...args) => emitTopologyBlackboardEvent(...args),
  emitTopologyReasoningLine: (...args) => emitTopologyReasoningLine(...args),
  appendExecutionTimeline: (...args) => appendExecutionTimeline(...args),
}));

vi.mock('../../toolExecutors/index.js', () => ({
  getExecutor: () => ({ execute: (...args) => executeFn(...args) }),
}));

vi.mock('../topologyCampaignInputs.js', () => ({
  buildCampaignNodeInput: () => ({}),
}));

import {
  extractMissingFields,
  runTopologyNodes,
  getNodeDependencies,
  getRunnableNodeIds,
  initializeNodeStatus,
} from '../topologyNodeRunner.js';

describe('extractMissingFields', () => {
  it('accepts string ids and {id} objects', () => {
    expect(extractMissingFields({ missingFields: ['reward', { id: 'stampThreshold' }] })).toEqual([
      'reward',
      'stampThreshold',
    ]);
  });
});

describe('runTopologyNodes awaiting_owner_input + resume', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const topology = {
    nodes: [
      { id: 'n1', toolName: 'tool.a', dependsOn: [] },
      { id: 'n2', toolName: 'tool.b', dependsOn: ['n1'] },
    ],
  };

  it('returns awaiting_owner_input with missingFields and ok:true', async () => {
    executeFn.mockImplementation(async (_input, ctx) => {
      // First runnable node only — n1
      void ctx;
      return {
        status: 'needs_input',
        missingFields: ['reward', { id: 'stampThreshold' }],
        message: 'What reward should customers receive?',
        suggestedQuestion: 'What reward should customers receive?',
        output: { partial: true },
      };
    });

    const result = await runTopologyNodes('mission_pause', topology, { executionMode: 'generic' });

    expect(result.ok).toBe(true);
    expect(result.status).toBe('awaiting_owner_input');
    expect(result.missingFields).toEqual(['reward', 'stampThreshold']);
    expect(result.pendingNodeId).toBe('n1');
    expect(result.failedNodeIds).toEqual([]);
    expect(emitTopologyBlackboardEvent).toHaveBeenCalledWith(
      'mission_pause',
      'owner_input_requested',
      expect.objectContaining({ pendingNodeId: 'n1', missingFields: ['reward', 'stampThreshold'] }),
    );
    expect(emitTopologyBlackboardEvent).not.toHaveBeenCalledWith(
      'mission_pause',
      'execution_failed',
      expect.anything(),
    );
  });

  it('resumes from pending node and keeps prior completed outputs', async () => {
    let call = 0;
    executeFn.mockImplementation(async () => {
      // @pure-transform test double — no IO in topology resume unit test
      call += 1;
      if (call === 1) {
        return { status: 'ok', output: { done: true } };
      }
      return { status: 'ok', output: { done2: true } };
    });

    const result = await runTopologyNodes(
      'mission_resume',
      topology,
      { executionMode: 'generic', ownerInput: { reward: 'Free coffee' } },
      {
        resumeFrom: 'n2',
        priorNodeStatus: { n1: 'completed', n2: 'needs_input' },
        priorNodeOutputs: { n1: { fromPrior: true } },
        priorToolOutputs: { 'tool.a': { fromPrior: true } },
      },
    );

    expect(result.ok).toBe(true);
    expect(result.status).toBe('completed');
    expect(result.nodeStatus.n1).toBe('completed');
    expect(result.nodeOutputs.n1).toEqual({ fromPrior: true });
    expect(result.nodeStatus.n2).toBe('completed');
    expect(emitTopologyBlackboardEvent).toHaveBeenCalledWith(
      'mission_resume',
      'topology.resumed',
      expect.objectContaining({ resumeFrom: 'n2' }),
    );
    expect(emitTopologyBlackboardEvent).toHaveBeenCalledWith(
      'mission_resume',
      'node.resumed',
      expect.objectContaining({ nodeId: 'n2' }),
    );
    // Only the resumed node should re-execute (n1 already complete).
    expect(executeFn).toHaveBeenCalledTimes(1);
  });

  it('does not re-pause when handler returns needs_input but executionDraft is complete', async () => {
    executeFn.mockImplementation(async (input) => {
      if (input.executionDraft?.reward) {
        return {
          status: 'needs_input',
          missingFields: ['reward', 'stampThreshold'],
          output: { loyaltyRequirements: input.executionDraft },
        };
      }
      return { status: 'needs_input', missingFields: ['reward'] };
    });

    const result = await runTopologyNodes(
      'mission_resume_draft',
      topology,
      {
        executionMode: 'loyalty',
        ownerInput: { reward: 'Free coffee', stampThreshold: 6 },
        executionDraft: { reward: 'Free coffee', stampThreshold: 6, requiredStamps: 6 },
      },
      {
        resumeFrom: 'n1',
        priorNodeStatus: { n1: 'needs_input' },
        priorNodeOutputs: {},
        priorToolOutputs: {},
      },
    );

    expect(result.status).toBe('completed');
    expect(emitTopologyBlackboardEvent).not.toHaveBeenCalledWith(
      'mission_resume_draft',
      'owner_input_requested',
      expect.anything(),
    );
  });
});

describe('topologyNodeRunner DAG helpers (smoke)', () => {
  it('still resolves dependsOn', () => {
    expect(getNodeDependencies({ id: 'x', dependsOn: ['a'] })).toEqual(['a']);
    expect(initializeNodeStatus([{ id: 'a' }])).toEqual({ a: 'pending' });
    expect(getRunnableNodeIds([{ id: 'a', dependsOn: [] }], { a: 'pending' })).toEqual(['a']);
  });
});
