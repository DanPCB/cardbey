/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resetExecutionModeForTests } from '../../runtime/executionMode.js';
import { dispatchIntakeToolViaUnifiedKernel } from '../intakeKernelToolDispatch.js';

const unifiedDispatchMock = vi.hoisted(() => vi.fn());

vi.mock('../unifiedDispatch.js', () => ({
  unifiedDispatch: (...args) => unifiedDispatchMock(...args),
}));

describe('dispatchIntakeToolViaUnifiedKernel', () => {
  const env = { ...process.env };

  beforeEach(() => {
    unifiedDispatchMock.mockReset();
    resetExecutionModeForTests();
    delete process.env.EXECUTION_MODE;
    delete process.env.EMERGENCY_BYPASS_KERNEL;
    delete process.env.DISABLE_KERNEL_MANDATORY;
  });

  afterEach(() => {
    process.env = { ...env };
    resetExecutionModeForTests();
  });

  it('blocks create_campaign with kernel-only message', async () => {
    const out = await dispatchIntakeToolViaUnifiedKernel('create_campaign', { storeId: 's1' }, {});
    expect(unifiedDispatchMock).not.toHaveBeenCalled();
    expect(out.toolResult.status).toBe('blocked');
    expect(out.toolResult.blocker?.code).toBe('KERNEL_EXECUTION_REQUIRED');
  });

  it('blocks launch_campaign with kernel-only message', async () => {
    const out = await dispatchIntakeToolViaUnifiedKernel('launch_campaign', { storeId: 's1' }, {});
    expect(unifiedDispatchMock).not.toHaveBeenCalled();
    expect(out.toolResult.status).toBe('blocked');
    expect(out.toolResult.blocker?.message).toContain('create_campaign');
  });

  it('blocks create_store with kernel-only message', async () => {
    const out = await dispatchIntakeToolViaUnifiedKernel('create_store', { businessName: 'Test' }, {});
    expect(unifiedDispatchMock).not.toHaveBeenCalled();
    expect(out.toolResult.status).toBe('blocked');
    expect(out.toolResult.blocker?.code).toBe('KERNEL_EXECUTION_REQUIRED');
  });

  it('routes registered tools through unifiedDispatch', async () => {
    unifiedDispatchMock.mockResolvedValue({
      ok: true,
      status: 'ok',
      toolResult: { status: 'ok', output: { message: 'Poster updated.' } },
      payload: { storeId: 'store-1' },
    });

    const out = await dispatchIntakeToolViaUnifiedKernel(
      'mutate_poster',
      { storeId: 'store-1', instruction: 'bigger title' },
      { missionId: 'mission-1', userId: 'user-1', source: 'intake_v2_unified' },
    );

    expect(unifiedDispatchMock).toHaveBeenCalledTimes(1);
    expect(unifiedDispatchMock.mock.calls[0][0].type).toBe('mutate_poster');
    expect(unifiedDispatchMock.mock.calls[0][1].source).toBe('intake_v2_unified');
    expect(out.toolResult.status).toBe('ok');
    expect(out.toolResult.output?.message).toBe('Poster updated.');
  });

  it('maps unified dispatch blocks to toolResult.blocked', async () => {
    unifiedDispatchMock.mockResolvedValue({
      ok: false,
      status: 'blocked',
      code: 'KERNEL_EXECUTION_REQUIRED',
      message: 'blocked',
    });

    const out = await dispatchIntakeToolViaUnifiedKernel('analyze_store', { storeId: 's1' }, {});
    expect(out.toolResult.status).toBe('blocked');
    expect(out.toolResult.blocker?.code).toBe('KERNEL_EXECUTION_REQUIRED');
  });
});
