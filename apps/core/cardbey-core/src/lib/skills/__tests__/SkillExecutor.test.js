import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SkillExecutor, clearSkillExecutionStoreForTests } from '../SkillExecutor.js';

describe('SkillExecutor', () => {
  const toolDispatcher = vi.fn();
  const appendEvent = vi.fn().mockResolvedValue({});

  /** @type {SkillExecutor} */
  let executor;

  const baseCtx = {
    missionId: 'mission-1',
    storeId: 'store-1',
    userId: 'user-1',
    toolInput: { foo: 'bar' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    clearSkillExecutionStoreForTests();
    executor = new SkillExecutor({
      toolDispatcher,
      blackboard: { appendEvent },
      prisma: null,
    });
  });

  it('executes all steps in order', async () => {
    toolDispatcher
      .mockResolvedValueOnce({ status: 'ok', output: { a: 1 } })
      .mockResolvedValueOnce({ status: 'ok', output: { b: 2 } });

    const skill = {
      name: 'ordered',
      version: '1',
      description: 'd',
      triggers: ['t'],
      steps: [
        { id: 'step_a', name: 'A', tool: 'tool_a' },
        { id: 'step_b', name: 'B', tool: 'tool_b' },
      ],
    };

    const execution = await executor.execute(skill, baseCtx);
    expect(execution.status).toBe('completed');
    expect(toolDispatcher).toHaveBeenCalledTimes(2);
    expect(execution.stepResults.step_a.ok).toBe(true);
    expect(execution.stepResults.step_b.ok).toBe(true);
  });

  it('skips step when condition returns false', async () => {
    toolDispatcher.mockResolvedValue({ status: 'ok', output: {} });

    const skill = {
      name: 'conditional',
      version: '1',
      description: 'd',
      triggers: ['t'],
      steps: [
        {
          id: 'skip_me',
          name: 'Skip',
          tool: 'tool_skip',
          condition: () => false,
        },
        { id: 'run_me', name: 'Run', tool: 'tool_run' },
      ],
    };

    const execution = await executor.execute(skill, baseCtx);
    expect(execution.status).toBe('completed');
    expect(toolDispatcher).toHaveBeenCalledTimes(1);
    expect(execution.stepResults.skip_me.skipped).toBe(true);
  });

  it('continues when required:false step fails', async () => {
    toolDispatcher
      .mockResolvedValueOnce({ status: 'failed', error: { code: 'X', message: 'optional fail' } })
      .mockResolvedValueOnce({ status: 'ok', output: { done: true } });

    const skill = {
      name: 'optional_fail',
      version: '1',
      description: 'd',
      triggers: ['t'],
      steps: [
        { id: 'optional', name: 'Optional', tool: 'tool_opt', required: false },
        { id: 'required', name: 'Required', tool: 'tool_req', required: true },
      ],
      retryPolicy: { maxAttempts: 1, backoffMs: 0 },
    };

    const execution = await executor.execute(skill, baseCtx);
    expect(execution.status).toBe('completed');
    expect(execution.stepResults.optional.ok).toBe(false);
    expect(execution.stepResults.required.ok).toBe(true);
  });

  it('retries on failure up to maxAttempts', async () => {
    toolDispatcher
      .mockResolvedValueOnce({ status: 'failed', error: { message: 'timeout', code: 'TOOL_EXECUTION_FAILED' } })
      .mockResolvedValueOnce({ status: 'ok', output: { ok: true } });

    const skill = {
      name: 'retry_skill',
      version: '1',
      description: 'd',
      triggers: ['t'],
      steps: [{ id: 'retry_step', name: 'Retry', tool: 'tool_retry' }],
      retryPolicy: { maxAttempts: 2, backoffMs: 0 },
    };

    const execution = await executor.execute(skill, baseCtx);
    expect(execution.status).toBe('completed');
    expect(toolDispatcher).toHaveBeenCalledTimes(2);
    expect(execution.stepResults.retry_step.attempts).toBe(2);
  });

  it('marks execution failed after retries exhausted', async () => {
    toolDispatcher.mockResolvedValue({
      status: 'failed',
      error: { message: 'timeout', code: 'TOOL_EXECUTION_FAILED' },
    });

    const skill = {
      name: 'fail_skill',
      version: '1',
      description: 'd',
      triggers: ['t'],
      steps: [{ id: 'fail_step', name: 'Fail', tool: 'tool_fail', required: true }],
      retryPolicy: { maxAttempts: 2, backoffMs: 0 },
    };

    const execution = await executor.execute(skill, baseCtx);
    expect(execution.status).toBe('failed');
    expect(execution.canResume).toBe(true);
    expect(toolDispatcher).toHaveBeenCalledTimes(2);
  });

  it('emits step events', async () => {
    const emitSpy = vi.spyOn(executor, '_emitStepEvent');
    toolDispatcher.mockResolvedValue({ status: 'ok', output: {} });

    const skill = {
      name: 'observable',
      version: '1',
      description: 'd',
      triggers: ['t'],
      observable: true,
      steps: [{ id: 'emit_step', name: 'Emit', tool: 'tool_emit' }],
    };

    await executor.execute(skill, baseCtx);
    expect(emitSpy).toHaveBeenCalled();
    expect(appendEvent).toHaveBeenCalled();
  });
});
