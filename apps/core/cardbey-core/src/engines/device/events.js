/**
 * Device Engine Events
 * Event emission for device engine actions
 * Now integrated with SSE for real-time dashboard updates
 */

import { broadcastSse } from '../../realtime/simpleSse.js';
import { DeviceEngineEventTypes } from './eventTypes.js';

/**
 * Event emitter implementation that broadcasts to SSE
 * Emits Device Engine events to SSE stream for dashboard consumption
 */
class DeviceEngineEventEmitter {
  /**
   * Emit a Device Engine event
   * @param {string} event - Event type (from DEVICE_EVENTS)
   * @param {Object} payload - Event payload
   */
  async emit(event, payload) {
    console.log(`[Device Engine Event] ${event}`, payload);
    
    // Map internal event types to SSE event types
    let sseEventType = null;
    let ssePayload = null;
    
    switch (event) {
      case DEVICE_EVENTS.PAIRING_REQUESTED:
        // Map to DeviceEngineEvent format
        sseEventType = DeviceEngineEventTypes.PAIR_REQUEST_CREATED;
        ssePayload = {
          pairRequestId: payload.deviceId,
          code: payload.pairingCode,
          expiresAt: payload.expiresAt || new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          deviceInfo: {
            deviceId: payload.deviceId,
            model: payload.deviceModel,
            platform: payload.platform,
            appVersion: payload.appVersion,
          },
        };
        break;
        
      case DEVICE_EVENTS.PAIRED:
        // Map to DeviceEngineEvent format
        sseEventType = DeviceEngineEventTypes.DEVICE_PAIRED;
        ssePayload = {
          deviceId: payload.deviceId,
          pairRequestId: payload.deviceId, // For Device Engine, these are the same
          name: payload.name,
          tenantId: payload.tenantId,
          storeId: payload.storeId,
        };
        break;
        
      case DEVICE_EVENTS.HEARTBEAT_RECEIVED:
        // Map to DeviceEngineEvent format
        sseEventType = DeviceEngineEventTypes.DEVICE_STATUS_CHANGED;
        ssePayload = {
          deviceId: payload.deviceId,
          status: payload.status || 'online',
          lastSeenAt: payload.lastSeenAt || new Date().toISOString(),
        };
        break;
        
      case DEVICE_EVENTS.OFFLINE_DETECTED:
        // Map to DeviceEngineEvent format
        sseEventType = DeviceEngineEventTypes.DEVICE_STATUS_CHANGED;
        ssePayload = {
          deviceId: payload.deviceId,
          status: 'offline',
          lastSeenAt: payload.lastSeenAt || new Date().toISOString(),
        };
        break;
        
      case DEVICE_EVENTS.PLAYLIST_READY:
        // Map to DeviceEngineEvent format
        sseEventType = DeviceEngineEventTypes.PLAYLIST_ASSIGNED;
        ssePayload = {
          deviceId: payload.deviceId,
          playlistId: payload.playlistId,
        };
        break;
        
      default:
        // For other events, don't broadcast to SSE (they're internal only)
        return;
    }
    
    // Broadcast to SSE as DeviceEngineEvent
    if (sseEventType && ssePayload) {
      try {
        broadcastSse('admin', 'device_engine_event', {
          type: sseEventType,
          payload: ssePayload,
        });
        console.log(`[Device Engine Event] Broadcasted to SSE: ${sseEventType}`, ssePayload);
      } catch (error) {
        console.error('[Device Engine Event] Failed to broadcast to SSE:', error);
      }
    }
  }
}

/**
 * Get event emitter instance
 */
export function getEventEmitter() {
  return new DeviceEngineEventEmitter();
}

/**
 * Event types (internal)
 */
export const DEVICE_EVENTS = {
  PAIRING_REQUESTED: 'device.pairing_requested',
  PAIRED: 'device.paired',
  HEARTBEAT_RECEIVED: 'device.heartbeat_received',
  OFFLINE_DETECTED: 'device.offline_detected',
  PLAYLIST_READY: 'device.playlist_ready',
  REPAIR_STARTED: 'device.repair_started',
  REPAIR_COMPLETED: 'device.repair_completed',
};

// Export event types for external use
export { DeviceEngineEventTypes };



