/**
 * SSE adapter for canonical execution notifications.
 */

import { broadcastSse } from './simpleSse.js';
import { EXECUTION_EVENT_TYPES } from '../lib/execution/executionNotificationSchema.js';

/**
 * @param {object} notification - from buildExecutionNotification
 */
export function broadcastExecutionNotification(notification) {
  if (!notification || typeof notification !== 'object') return;
  const missionId =
    typeof notification.missionId === 'string' ? notification.missionId.trim() : '';
  if (!missionId) return;

  const type = String(notification.type ?? '').trim();
  const payload = {
    ...notification,
    missionId,
  };

  broadcastSse(`mission:${missionId}`, type, payload);

  if (type === EXECUTION_EVENT_TYPES.CHECKPOINT_AWAITING && notification.checkpoint) {
    broadcastSse(`mission:${missionId}`, 'mission.checkpoint', {
      missionId,
      checkpoint: notification.checkpoint,
      stepId: notification.stepId ?? notification.checkpoint?.stepId ?? null,
    });
  }
}
