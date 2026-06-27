import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../missionBlackboard.js', () => ({
  appendEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../realtime/executionNotifications.js', () => ({
  broadcastExecutionNotification: vi.fn(),
}));

import { appendEvent } from '../../missionBlackboard.js';
import { broadcastExecutionNotification } from '../../../realtime/executionNotifications.js';
import { emitExecutionNotification, EXECUTION_EVENT_TYPES } from '../executionNotificationEmitter.js';

describe('executionNotificationEmitter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('persists and broadcasts canonical notifications with missionId', async () => {
    const notification = await emitExecutionNotification(
      EXECUTION_EVENT_TYPES.STARTED,
      { tool: 'create_store' },
      { missionId: 'm-1', source: 'test', executionPath: 'kernel_dispatch' },
    );

    expect(notification.type).toBe(EXECUTION_EVENT_TYPES.STARTED);
    expect(notification.missionId).toBe('m-1');
    expect(appendEvent).toHaveBeenCalledWith(
      'm-1',
      EXECUTION_EVENT_TYPES.STARTED,
      expect.objectContaining({ missionId: 'm-1', type: EXECUTION_EVENT_TYPES.STARTED }),
    );
    expect(broadcastExecutionNotification).toHaveBeenCalledWith(
      expect.objectContaining({ missionId: 'm-1', type: EXECUTION_EVENT_TYPES.STARTED }),
    );
  });

  it('skips persist and broadcast when missionId is missing', async () => {
    await emitExecutionNotification(EXECUTION_EVENT_TYPES.STEP_STARTED, { stepId: 's1' }, {});

    expect(appendEvent).not.toHaveBeenCalled();
    expect(broadcastExecutionNotification).not.toHaveBeenCalled();
  });
});
