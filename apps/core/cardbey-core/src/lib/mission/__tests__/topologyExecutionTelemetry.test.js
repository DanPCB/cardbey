/**
 * @vitest-environment node
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const appendEvent = vi.fn(async () => ({ ok: true, seq: 1 }));
const scheduleReasoningLinePersist = vi.fn();
const readMetadata = vi.fn(async () => ({ executionTimeline: [] }));
const writeMetadata = vi.fn(async () => ({}));

vi.mock('../../missionBlackboard.js', () => ({
  appendEvent: (...args) => appendEvent(...args),
}));

vi.mock('../../reasoningLinePersist.js', () => ({
  scheduleReasoningLinePersist: (...args) => scheduleReasoningLinePersist(...args),
}));

vi.mock('../../persistence/metadataWriter.js', () => ({
  readMetadata: (...args) => readMetadata(...args),
  writeMetadata: (...args) => writeMetadata(...args),
}));

import {
  buildTopologyFailureSummary,
  normalizeTopologyError,
  recordTopologyNodeEvent,
  resolveTopologyNodeLabel,
  sanitizeForTelemetry,
} from '../topologyExecutionTelemetry.js';

describe('topologyExecutionTelemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves human node labels', () => {
    expect(resolveTopologyNodeLabel({ labels: { en: 'Analyze store' } }, 'setup_loyalty_program')).toBe(
      'Analyze store',
    );
    expect(resolveTopologyNodeLabel({ label: 'Apply loyalty' }, 'x')).toBe('Apply loyalty');
  });

  it('normalizes errors and sanitizes IO', () => {
    expect(normalizeTopologyError({ message: 'Reward threshold is required.' })).toEqual({
      message: 'Reward threshold is required.',
    });
    const truncated = sanitizeForTelemetry({ a: 'x'.repeat(5000) }, 100);
    expect(truncated._truncated).toBe(true);
  });

  it('records node lifecycle onto blackboard + reasoning + timeline', async () => {
    await recordTopologyNodeEvent({
      missionId: 'm1',
      phase: 'node_started',
      nodeId: 'n1',
      toolName: 'setup_loyalty_program',
      label: 'Analyze store',
      status: 'running',
    });
    await recordTopologyNodeEvent({
      missionId: 'm1',
      phase: 'node_finished',
      nodeId: 'n2',
      toolName: 'setup_loyalty_program',
      label: 'Apply loyalty',
      status: 'failed',
      error: { message: 'Reward threshold is required.' },
    });

    expect(appendEvent).toHaveBeenCalled();
    expect(appendEvent.mock.calls.some((c) => c[1] === 'topology.node.started')).toBe(true);
    expect(appendEvent.mock.calls.some((c) => c[1] === 'topology.node.finished')).toBe(true);
    expect(scheduleReasoningLinePersist).toHaveBeenCalledWith('m1', '→ Analyze store', expect.any(Object));
    expect(scheduleReasoningLinePersist).toHaveBeenCalledWith('m1', '✗ Apply loyalty', expect.any(Object));
    expect(scheduleReasoningLinePersist).toHaveBeenCalledWith(
      'm1',
      'Reason: Reward threshold is required.',
      expect.any(Object),
    );
    expect(writeMetadata).toHaveBeenCalled();
  });

  it('buildTopologyFailureSummary prefers first failed node reason', () => {
    const summary = buildTopologyFailureSummary(
      {
        failedNodeIds: ['apply_1'],
        nodeOutputs: {
          apply_1: { error: { message: 'Reward threshold is required.' } },
        },
      },
      [{ id: 'apply_1', labels: { en: 'Apply loyalty' }, toolName: 'setup_loyalty_program' }],
    );
    expect(summary.headline).toBe('Apply loyalty failed');
    expect(summary.detail).toBe('Reward threshold is required.');
    expect(summary.reason).toBe('Reward threshold is required.');
  });

  it('normalizeTopologyError strips title-failed echoes', () => {
    const node = { labels: { en: 'Apply loyalty' }, toolName: 'setup_loyalty_program' };
    expect(normalizeTopologyError({ message: 'Apply loyalty failed' }, node).message).toBe(
      'Step failed',
    );
    expect(
      normalizeTopologyError(
        { message: 'Apply loyalty failed — Reward threshold is required.' },
        node,
      ).message,
    ).toBe('Reward threshold is required.');
  });
});
