// DANH: skill-runtime-phase8
/**
 * Phase 8 tests — cooperative gate return normalization (mirrors performerIntakeV2Routes L703+).
 */

import { describe, it, expect } from 'vitest';
import type { RuntimeDispatchResult } from '../dispatchWithRuntime.js';
import type { Checkpoint } from '../types.js';

/** Mirrors the Phase 8 gate return block in performerIntakeV2Routes.js */
function normalizeSkillRuntimeGateReturn(
  runtimeResult: RuntimeDispatchResult,
  dispatchMissionId: string | null = null
) {
  const checkpoint = runtimeResult.result;

  const stepResults =
    checkpoint?.stepResults instanceof Map
      ? Object.fromEntries(checkpoint.stepResults)
      : checkpoint?.stepResults ?? {};

  const lastStepOutput = Object.values(stepResults).at(-1) as
    | { output?: { message?: string; summary?: string; topAction?: string } }
    | undefined;
  const summaryMessage =
    lastStepOutput?.output?.message ??
    lastStepOutput?.output?.summary ??
    lastStepOutput?.output?.topAction ??
    (runtimeResult.state === 'completed'
      ? 'Your store analytics are ready.'
      : `Skill ended in state: ${runtimeResult.state}`);

  const ok = runtimeResult.state === 'completed';

  return {
    toolResult: {
      status: ok ? ('ok' as const) : ('failed' as const),
      output: {
        dispatchedVia: 'skill_runtime' as const,
        skillId: runtimeResult.skillId,
        state: runtimeResult.state,
        stepResults,
        message: summaryMessage,
      },
      ...(ok
        ? {}
        : {
            error: {
              code: 'SKILL_RUNTIME_FAILED',
              message: `Skill ended in state: ${runtimeResult.state}`,
            },
          }),
    },
    payload: {
      missionId: dispatchMissionId ?? null,
      dispatchedVia: 'skill_runtime' as const,
      skillId: runtimeResult.skillId,
      state: runtimeResult.state,
      result: runtimeResult.result,
      stepResults,
    },
  };
}

const baseCheckpoint = (): Checkpoint => ({
  skillId: 'analytics_report',
  intent: 'analytics_report',
  state: 'completed',
  completedSteps: [],
  currentStepIndex: 0,
  context: {
    query: 'How is my store performing?',
    userId: 'user-1',
    conversationId: 'conv-1',
    userHasProducts: false,
    metadata: {},
  },
  stepResults: new Map(),
  timestamp: new Date(),
});

describe('skill runtime gate normalization (phase 8)', () => {
  it('completed runtime result → status ok', () => {
    const runtimeResult: RuntimeDispatchResult = {
      matched: true,
      dispatchedVia: 'skill_runtime',
      skillId: 'analytics_report',
      state: 'completed',
      result: {
        ...baseCheckpoint(),
        stepResults: new Map([
          [
            'store_analytics',
            {
              status: 'completed',
              output: { bookingCount: 5, productCount: 3 },
            },
          ],
          [
            'report_summary',
            {
              status: 'completed',
              output: { message: 'Your store looks healthy.' },
            },
          ],
        ]),
      },
    };

    const { toolResult } = normalizeSkillRuntimeGateReturn(runtimeResult, 'mission-1');

    expect(toolResult.status).toBe('ok');
    expect(toolResult.output.dispatchedVia).toBe('skill_runtime');
    expect(toolResult.output.stepResults['store_analytics'].output.bookingCount).toBe(5);
    expect(toolResult.output.message).toBe('Your store looks healthy.');
    expect(toolResult).not.toHaveProperty('error');
  });

  it('failed runtime result → status failed', () => {
    const runtimeResult: RuntimeDispatchResult = {
      matched: true,
      dispatchedVia: 'skill_runtime',
      skillId: 'analytics_report',
      state: 'failed',
      result: { ...baseCheckpoint(), state: 'failed', stepResults: new Map() },
    };

    const { toolResult } = normalizeSkillRuntimeGateReturn(runtimeResult);

    expect(toolResult.status).toBe('failed');
    expect(toolResult.error?.code).toBe('SKILL_RUNTIME_FAILED');
    expect(toolResult.output.state).toBe('failed');
  });

  it('stepResults as plain object (not Map) does not throw', () => {
    const runtimeResult: RuntimeDispatchResult = {
      matched: true,
      dispatchedVia: 'skill_runtime',
      skillId: 'analytics_report',
      state: 'completed',
      result: {
        ...baseCheckpoint(),
        stepResults: { step1: { output: {} } } as unknown as Map<string, unknown>,
      },
    };

    expect(() => normalizeSkillRuntimeGateReturn(runtimeResult)).not.toThrow();
    const { toolResult } = normalizeSkillRuntimeGateReturn(runtimeResult);
    expect(toolResult.output.stepResults.step1).toBeDefined();
  });

  it('empty stepResults → generic completed message', () => {
    const runtimeResult: RuntimeDispatchResult = {
      matched: true,
      dispatchedVia: 'skill_runtime',
      skillId: 'analytics_report',
      state: 'completed',
      result: { ...baseCheckpoint(), stepResults: new Map() },
    };

    const { toolResult } = normalizeSkillRuntimeGateReturn(runtimeResult);

    expect(toolResult.output.message).toBe('Your store analytics are ready.');
  });

  it('summaryMessage priority: message over topAction', () => {
    const runtimeResult: RuntimeDispatchResult = {
      matched: true,
      dispatchedVia: 'skill_runtime',
      skillId: 'analytics_report',
      state: 'completed',
      result: {
        ...baseCheckpoint(),
        stepResults: new Map([
          [
            'final_step',
            {
              output: {
                message: 'Primary message wins.',
                topAction: 'Should not be used',
              },
            },
          ],
        ]),
      },
    };

    const { toolResult } = normalizeSkillRuntimeGateReturn(runtimeResult);

    expect(toolResult.output.message).toBe('Primary message wins.');
  });
});
