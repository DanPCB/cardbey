import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SkillExecutor, clearSkillExecutionStoreForTests } from '../SkillExecutor.js';

describe('SkillExecutor null tool steps', () => {
  const toolDispatcher = vi.fn();
  const appendEvent = vi.fn().mockResolvedValue({});

  /** @type {SkillExecutor} */
  let executor;

  const baseCtx = {
    missionId: 'mission-null',
    storeId: 'store-1',
    userId: 'user-1',
    toolInput: {},
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

  it('skips step with tool:null gracefully', async () => {
    toolDispatcher.mockResolvedValue({ status: 'ok', output: { done: true } });

    const skill = {
      name: 'null_tool_skill',
      version: '1',
      description: 'd',
      triggers: ['t'],
      observable: true,
      steps: [
        { id: 'delegate', name: 'Delegate', tool: null, required: false },
        { id: 'next_step', name: 'Next', tool: 'tool_next', required: true },
      ],
    };

    const execution = await executor.execute(skill, baseCtx);
    expect(execution.status).toBe('completed');
    expect(execution.stepResults.delegate).toEqual({
      skipped: true,
      reason: 'delegated_to_skill',
    });
    expect(toolDispatcher).toHaveBeenCalledTimes(1);
    expect(toolDispatcher).toHaveBeenCalledWith('tool_next', expect.any(Object), expect.any(Object));
  });

  it('records skipped step as { skipped: true }', async () => {
    toolDispatcher.mockResolvedValue({ status: 'ok', output: {} });

    const skill = {
      name: 'null_record',
      version: '1',
      description: 'd',
      triggers: ['t'],
      steps: [
        { id: 'null_step', name: 'Null', tool: null },
        { id: 'after', name: 'After', tool: 'tool_after' },
      ],
    };

    const execution = await executor.execute(skill, baseCtx);
    expect(execution.stepResults.null_step.skipped).toBe(true);
    expect(execution.stepResults.null_step.reason).toBe('delegated_to_skill');
  });

  it('continues to next step after null tool', async () => {
    toolDispatcher.mockResolvedValue({ status: 'ok', output: { value: 42 } });

    const skill = {
      name: 'null_continue',
      version: '1',
      description: 'd',
      triggers: ['t'],
      steps: [
        { id: 'null_step', name: 'Null', tool: null },
        { id: 'final', name: 'Final', tool: 'tool_final' },
      ],
    };

    const execution = await executor.execute(skill, baseCtx);
    expect(execution.status).toBe('completed');
    expect(execution.stepResults.final.ok).toBe(true);
    expect(execution.stepResults.final.output).toEqual({ value: 42 });
  });

  it('calls _emitStepEvent with skipped status', async () => {
    const emitSpy = vi.spyOn(executor, '_emitStepEvent');
    toolDispatcher.mockResolvedValue({ status: 'ok', output: {} });

    const skill = {
      name: 'null_emit',
      version: '1',
      description: 'd',
      triggers: ['t'],
      observable: true,
      steps: [
        { id: 'null_step', name: 'Null', tool: null },
        { id: 'tail', name: 'Tail', tool: 'tool_tail' },
      ],
    };

    await executor.execute(skill, baseCtx);

    expect(emitSpy).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ id: 'null_step' }),
      'skipped',
      expect.objectContaining({ skipped: true, reason: 'delegated_to_skill' }),
    );
  });
});
