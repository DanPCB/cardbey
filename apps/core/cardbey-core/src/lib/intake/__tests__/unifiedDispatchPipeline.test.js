/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../createStoreCheckpointDispatch.js', () => ({
  dispatchCreateStoreCheckpointPipeline: vi.fn(async () => ({
    kind: 'started',
    responseBody: {
      success: true,
      action: 'store_mission_started',
      missionId: 'm-unified-1',
    },
    telemetry: {},
  })),
}));

vi.mock('../runtime/kernelMandatory.js', () => ({
  assertKernelAuthorizedExecution: vi.fn(() => ({ ok: true })),
}));

import { unifiedDispatch } from '../unifiedDispatch.js';
import { dispatchCreateStoreCheckpointPipeline } from '../createStoreCheckpointDispatch.js';

describe('unifiedDispatch pipeline actions', () => {
  beforeEach(() => {
    dispatchCreateStoreCheckpointPipeline.mockClear();
  });

  it('routes create_store_checkpoint through dispatch pipeline', async () => {
    const result = await unifiedDispatch(
      {
        type: 'create_store_checkpoint',
        payload: { userMessage: 'Create store Test' },
      },
      { source: 'intake_v2_classified_checkpoint' },
    );

    expect(dispatchCreateStoreCheckpointPipeline).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    expect(result.executionPath).toBe('kernel_dispatch');
    expect(result.action).toBe('store_mission_started');
    expect(result.missionId).toBe('m-unified-1');
  });
});
