import { describe, it, expect } from 'vitest';
import {
  EXECUTION_STATES,
  isRealExecution,
  isSuccess,
  isSloSuccessState,
  resolveExecutionState,
  deriveExecutionStateFromRuntime,
} from '../../lib/telemetry/executionStates.js';

describe('Execution States', () => {
  it('identifies real execution states', () => {
    expect(isRealExecution(EXECUTION_STATES.EXECUTED)).toBe(true);
    expect(isRealExecution(EXECUTION_STATES.FAILED)).toBe(true);
    expect(isRealExecution(EXECUTION_STATES.PARTIAL)).toBe(true);
    expect(isRealExecution(EXECUTION_STATES.STUBBED)).toBe(false);
    expect(isRealExecution(EXECUTION_STATES.PLANNED)).toBe(false);
    expect(isRealExecution(EXECUTION_STATES.BLOCKED)).toBe(false);
  });

  it('identifies success states', () => {
    expect(isSuccess(EXECUTION_STATES.EXECUTED)).toBe(true);
    expect(isSuccess(EXECUTION_STATES.PARTIAL)).toBe(true);
    expect(isSuccess(EXECUTION_STATES.STUBBED)).toBe(false);
    expect(isSloSuccessState(EXECUTION_STATES.EXECUTED)).toBe(true);
  });

  it('resolves stubbed and blocked metadata', () => {
    expect(
      resolveExecutionState({
        metadata: { stubbed: true },
        result: { success: true },
      }),
    ).toBe(EXECUTION_STATES.STUBBED);

    expect(
      resolveExecutionState({
        metadata: { blocked: true },
        result: { success: false },
      }),
    ).toBe(EXECUTION_STATES.BLOCKED);

    expect(
      resolveExecutionState({
        metadata: { planned: true },
        result: { success: true },
      }),
    ).toBe(EXECUTION_STATES.PLANNED);
  });

  it('derives stubbed state from deploy output', () => {
    expect(
      deriveExecutionStateFromRuntime({
        status: 'ok',
        output: { deployed: false, stubbed: true },
      }),
    ).toBe(EXECUTION_STATES.STUBBED);
  });

  it('derives blocked state from runtime blocker', () => {
    expect(
      deriveExecutionStateFromRuntime({
        status: 'blocked',
        blocker: { code: 'NOT_IMPLEMENTED', message: 'blocked' },
      }),
    ).toBe(EXECUTION_STATES.BLOCKED);
  });
});
