/**
 * Activity Event Service
 * 
 * Provides structured logging of system events for reporting and analytics.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Activity Event Types
 */
export const ActivityEventType = {
  DEVICE_HEARTBEAT: 'device_heartbeat',
  DEVICE_STATUS_CHANGE: 'device_status_change',
  PLAYLIST_ASSIGNED: 'playlist_assigned',
  PLAYLIST_ERROR: 'playlist_error',
  ORIENTATION_CHANGED: 'orientation_changed',
  FEEDBACK_POSITIVE: 'feedback_positive',
  FEEDBACK_NEGATIVE: 'feedback_negative',
  ASSISTANT_BAD_ANSWER: 'assistant_bad_answer',
  ASSISTANT_GOOD_ANSWER: 'assistant_good_answer',
};

/**
 * Normalize payload to ensure it's JSON-serializable
 * Removes functions, circular references, and limits size
 */
function normalizePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  try {
    // Convert to JSON and back to remove non-serializable values
    const jsonString = JSON.stringify(payload, (key, value) => {
      // Skip functions
      if (typeof value === 'function') {
        return undefined;
      }
      // Limit string length
      if (typeof value === 'string' && value.length > 10000) {
        return value.substring(0, 10000) + '...[truncated]';
      }
      return value;
    });

    const parsed = JSON.parse(jsonString);

    // Limit object size (max 50KB)
    const sizeEstimate = JSON.stringify(parsed).length;
    if (sizeEstimate > 50000) {
      return {
        _truncated: true,
        _originalSize: sizeEstimate,
        data: Object.keys(parsed).slice(0, 10).reduce((acc, key) => {
          acc[key] = parsed[key];
          return acc;
        }, {}),
      };
    }

    return parsed;
  } catch (error) {
    console.warn('[ActivityEvent] Error normalizing payload:', error);
    return { _error: 'Failed to normalize payload', _originalType: typeof payload };
  }
}

/**
 * Log an activity event
 * 
 * @param {Object} input - Event input
 * @param {string} [input.tenantId] - Tenant ID
 * @param {string} [input.deviceId] - Device ID
 * @param {string} [input.storeId] - Store ID
 * @param {string} [input.userId] - User ID
 * @param {string} input.type - Event type (ActivityEventType)
 * @param {Object} input.payload - Event payload (will be normalized)
 * @param {Date} [input.occurredAt] - When the event occurred (defaults to now)
 */
export async function logActivityEvent(input) {
  const {
    tenantId,
    deviceId,
    storeId,
    userId,
    type,
    payload,
    occurredAt = new Date(),
  } = input;

  if (!type) {
    throw new Error('Activity event type is required');
  }

  const normalizedPayload = normalizePayload(payload);

  try {
    await prisma.activityEvent.create({
      data: {
        tenantId: tenantId || null,
        deviceId: deviceId || null,
        storeId: storeId || null,
        userId: userId || null,
        type,
        payload: normalizedPayload,
        occurredAt,
      },
    });
  } catch (error) {
    console.error('[ActivityEvent] Failed to log event:', error);
    // Don't throw - logging failures shouldn't break the app
  }
}

/**
 * Log a device error event
 * 
 * @param {Object} options
 * @param {string} options.deviceId - Device ID
 * @param {string} [options.tenantId] - Tenant ID
 * @param {string} [options.storeId] - Store ID
 * @param {string} options.error - Error message or code
 * @param {Object} [options.metadata] - Additional metadata
 */
export async function logDeviceError({ deviceId, tenantId, storeId, error, metadata = {} }) {
  return logActivityEvent({
    tenantId,
    deviceId,
    storeId,
    type: ActivityEventType.PLAYLIST_ERROR,
    payload: {
      error,
      ...metadata,
    },
  });
}

/**
 * Log a playlist assignment event
 * 
 * @param {Object} options
 * @param {string} options.deviceId - Device ID
 * @param {string} options.playlistId - Playlist ID
 * @param {string} [options.tenantId] - Tenant ID
 * @param {string} [options.storeId] - Store ID
 * @param {string} [options.userId] - User who assigned it
 * @param {Object} [options.metadata] - Additional metadata
 */
export async function logPlaylistAssigned({
  deviceId,
  playlistId,
  tenantId,
  storeId,
  userId,
  metadata = {},
}) {
  return logActivityEvent({
    tenantId,
    deviceId,
    storeId,
    userId,
    type: ActivityEventType.PLAYLIST_ASSIGNED,
    payload: {
      playlistId,
      ...metadata,
    },
  });
}

/**
 * Log assistant feedback
 * 
 * @param {Object} options
 * @param {string} [options.tenantId] - Tenant ID
 * @param {string} [options.userId] - User ID
 * @param {string} options.type - "assistant_bad_answer" or "assistant_good_answer"
 * @param {string} [options.question] - The question that was asked
 * @param {string} [options.answer] - The answer that was given
 * @param {string} [options.feedback] - User feedback text
 * @param {Object} [options.metadata] - Additional metadata
 */
export async function logAssistantFeedback({
  tenantId,
  userId,
  type,
  question,
  answer,
  feedback,
  metadata = {},
}) {
  if (type !== ActivityEventType.ASSISTANT_BAD_ANSWER && type !== ActivityEventType.ASSISTANT_GOOD_ANSWER) {
    throw new Error('Assistant feedback type must be assistant_bad_answer or assistant_good_answer');
  }

  return logActivityEvent({
    tenantId,
    userId,
    type,
    payload: {
      question,
      answer,
      feedback,
      ...metadata,
    },
  });
}

