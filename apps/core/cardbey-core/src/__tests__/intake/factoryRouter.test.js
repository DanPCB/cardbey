/**
 * Factory routing unified dispatch contract.
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EXECUTION_STATES } from '../../lib/telemetry/executionStates.js';

const executeRuntimeActionMock = vi.hoisted(() => vi.fn());

vi.mock('../../lib/runtime/performerRuntime/executeRuntimeAction.js', () => ({
  executeRuntimeAction: (...args) => executeRuntimeActionMock(...args),
}));

describe('Factory Router Unified', () => {
  beforeEach(() => {
    executeRuntimeActionMock.mockReset();
  });

  it('routes run_factory through unifiedDispatch with intake_v2_unified source', async () => {
    executeRuntimeActionMock.mockResolvedValue({
      status: 'ok',
      output: {
        factoryExecution: {
          factoryId: 'creative_asset_factory_v4',
          status: 'completed',
          missionId: 'm-1',
        },
      },
    });

    const { unifiedDispatch } = await import('../../lib/intake/unifiedDispatch.js');
    const result = await unifiedDispatch(
      {
        type: 'run_factory',
        payload: {
          factoryId: 'creative_asset_factory_v4',
          intent: 'Promo video',
          missionId: 'm-1',
          userId: 'user-1',
          storeId: 'store-1',
        },
      },
      { source: 'intake_v2_unified' },
    );

    expect(result.source).toBe('intake_v2_unified');
    expect(result.actionType).toBe('run_factory');
    expect(result.executionState).toBe(EXECUTION_STATES.EXECUTED);
    expect(executeRuntimeActionMock).toHaveBeenCalledTimes(1);
    expect(executeRuntimeActionMock.mock.calls[0][0].source).toBe('intake_v2_unified');
  });

  it('requires confirmation gate for activate_campaigns via unified dispatch', async () => {
    const { unifiedDispatch } = await import('../../lib/intake/unifiedDispatch.js');
    const result = await unifiedDispatch(
      {
        type: 'activate_campaigns',
        payload: { storeId: 'store-1', userId: 'user-1' },
      },
      { source: 'intake_v2_unified', requireConfirmation: true, confirmed: false },
    );

    expect(result.status).toBe('pending_confirmation');
    expect(result.proposedAction).toBe('activate_campaigns');
    expect(executeRuntimeActionMock).not.toHaveBeenCalled();
  });
});
