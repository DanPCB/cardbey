/**
 * Canonical execution notification emitter — blackboard persistence + SSE broadcast.
 */

import { appendEvent as appendMissionBlackboardEvent } from '../missionBlackboard.js';
import {
  buildExecutionNotification,
  EXECUTION_EVENT_TYPES,
} from './executionNotificationSchema.js';
import { broadcastExecutionNotification } from '../../realtime/executionNotifications.js';

export { EXECUTION_EVENT_TYPES };

/**
 * Build, persist, and broadcast a canonical execution notification.
 *
 * @param {string} type - canonical or legacy event type
 * @param {object} [payload]
 * @param {{ missionId?: string, executionPath?: string, source?: string }} [ctx]
 * @returns {Promise<object>}
 */
export async function emitExecutionNotification(type, payload = {}, ctx = {}) {
  const notification = buildExecutionNotification(type, payload, ctx);
  const missionId =
    typeof notification.missionId === 'string' ? notification.missionId.trim() : '';

  if (missionId) {
    await appendMissionBlackboardEvent(missionId, notification.type, notification).catch(() => {});
    broadcastExecutionNotification(notification);
  }

  return notification;
}
