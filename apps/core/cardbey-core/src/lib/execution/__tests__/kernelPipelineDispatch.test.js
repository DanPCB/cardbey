/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { executeRuntimeActionMock } = vi.hoisted(() => ({
  executeRuntimeActionMock: vi.fn(),
}));

vi.mock('../../runtime/performerRuntime/executeRuntimeAction.js', () => ({
  executeRuntimeAction: (...args) => executeRuntimeActionMock(...args),
}));

vi.mock('../../prisma.js', () => ({
  getPrismaClient: vi.fn(() => ({
    missionPipeline: {
      findUnique: vi.fn(async () => ({ status: 'awaiting_input', runState: 'blocked_on_checkpoint' })),
    },
  })),
}));

import {
  dispatchCreateStoreViaKernel,
  dispatchCreateCampaignViaKernel,
  dispatchToolViaKernel,
  mapCreateStoreRuntimeToRunResult,
  mapCreateCampaignRuntimeToRunResult,
} from '../kernelPipelineDispatch.js';

vi.mock('./executionNotificationEmitter.js', () => ({
  emitExecutionNotification: vi.fn(async () => ({})),
  EXECUTION_EVENT_TYPES: {
    STEP_STARTED: 'execution.step.started',
    STEP_COMPLETED: 'execution.step.completed',
    FAILED: 'execution.failed',
  },
}));

describe('kernelPipelineDispatch', () => {
  beforeEach(() => {
    executeRuntimeActionMock.mockReset();
  });

  it('dispatches create_store through executeRuntimeAction', async () => {
    executeRuntimeActionMock.mockResolvedValue({
      status: 'ok',
      output: {
        missionId: 'm-kernel-1',
        mode: 'checkpoint_pipeline',
        status: 'awaiting_input',
        jobId: 'job-1',
        draftId: 'draft-1',
      },
    });

    const result = await dispatchCreateStoreViaKernel({
      missionId: 'm-kernel-1',
      user: { id: 'user-1' },
      body: { businessName: 'Test Store', businessType: 'Retail', location: 'Melbourne' },
      source: 'intake_v2_unified',
    });

    expect(executeRuntimeActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'dispatch_tool',
        actionId: 'tool:create_store',
        missionId: 'm-kernel-1',
        source: 'intake_v2_unified',
        payload: expect.objectContaining({ toolName: 'create_store' }),
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.missionId).toBe('m-kernel-1');
    expect(result.dispatchedVia).toBe('runtime_kernel');
  });

  it('maps blocked runtime results to failed run results', async () => {
    const mapped = await mapCreateStoreRuntimeToRunResult(
      {
        status: 'blocked',
        blocker: { code: 'KERNEL_EXECUTION_REQUIRED', message: 'blocked' },
      },
      'm-kernel-2',
    );
    expect(mapped.ok).toBe(false);
    expect(mapped.error).toBe('KERNEL_EXECUTION_REQUIRED');
  });

  it('trusts runtime checkpoint output when DB read races pipeline write', async () => {
    const { getPrismaClient } = await import('../../prisma.js');
    getPrismaClient.mockReturnValueOnce({
      missionPipeline: {
        findUnique: vi.fn(async () => ({ status: 'executing', runState: 'running' })),
      },
    });

    const mapped = await mapCreateStoreRuntimeToRunResult(
      {
        status: 'ok',
        output: {
          missionId: 'm-kernel-3',
          mode: 'checkpoint_pipeline',
          status: 'awaiting_input',
        },
      },
      'm-kernel-3',
    );

    expect(mapped.ok).toBe(true);
    expect(mapped.mode).toBe('checkpoint_pipeline');
    expect(mapped.status).toBe('awaiting_input');
  });

  it('dispatches create_campaign through executeRuntimeAction', async () => {
    executeRuntimeActionMock.mockResolvedValue({
      status: 'ok',
      output: {
        missionId: 'm-campaign-1',
        mode: 'checkpoint_pipeline',
        status: 'awaiting_input',
        campaignId: 'camp-1',
      },
    });

    const result = await dispatchCreateCampaignViaKernel({
      missionId: 'm-campaign-1',
      user: { id: 'user-1' },
      body: { storeId: 'store-1', campaignContext: 'Spring promo' },
      source: 'intake_v2_unified',
    });

    expect(executeRuntimeActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'dispatch_tool',
        actionId: 'tool:create_campaign',
        missionId: 'm-campaign-1',
        source: 'intake_v2_unified',
        payload: expect.objectContaining({ toolName: 'create_campaign' }),
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.missionId).toBe('m-campaign-1');
    expect(result.dispatchedVia).toBe('runtime_kernel');
  });

  it('maps blocked campaign runtime results to failed run results', async () => {
    const mapped = await mapCreateCampaignRuntimeToRunResult(
      {
        status: 'blocked',
        blocker: { code: 'MISSION_REQUIRED', message: 'blocked' },
      },
      'm-campaign-2',
    );
    expect(mapped.ok).toBe(false);
    expect(mapped.error).toBe('MISSION_REQUIRED');
  });

  it('dispatchToolViaKernel routes any tool through executeRuntimeAction', async () => {
    executeRuntimeActionMock.mockResolvedValue({
      status: 'ok',
      output: { message: 'done' },
    });

    const result = await dispatchToolViaKernel({
      toolName: 'mutate_poster',
      missionId: 'm-tool-1',
      userId: 'user-1',
      source: 'intake_v2_unified',
      input: { instruction: 'bigger title' },
      emitCanonicalEvents: false,
    });

    expect(executeRuntimeActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'dispatch_tool',
        actionId: 'tool:mutate_poster',
        missionId: 'm-tool-1',
        source: 'intake_v2_unified',
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.dispatchedVia).toBe('runtime_kernel');
  });
});
