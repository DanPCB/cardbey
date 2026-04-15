/**
 * Device Engine Event Types and Emitter
 * Defines canonical Device V2 event types and provides event emission
 */

import { EventEmitter } from 'events';
import { broadcastSse } from '../../realtime/simpleSse.js';

/**
 * Device Engine Event Types
 * @typedef {Object} DeviceEngineEvent
 * @property {string} type - Event type
 * @property {Object} payload - Event payload
 */

/**
 * Device pairing requested event
 * @typedef {Object} DevicePairingRequestedPayload
 * @property {string} sessionId - Session/device ID
 * @property {string} code - Pairing code
 * @property {"DEVICE_V2"|"LEGACY"} engine - Engine type
 * @property {string} [deviceType] - Device type (screen, pos, etc.)
 * @property {string} [tenantId] - Tenant ID (if available)
 * @property {string} [storeId] - Store ID (if available)
 * @property {string} expiresAt - ISO timestamp when code expires
 */

/**
 * Device pairing claimed event
 * @typedef {Object} DevicePairingClaimedPayload
 * @property {string} sessionId - Session ID
 * @property {string} deviceId - Device ID (after pairing)
 * @property {string} [tenantId] - Tenant ID
 * @property {string} [storeId] - Store ID
 */

/**
 * Device status changed event
 * @typedef {Object} DeviceStatusChangedPayload
 * @property {string} deviceId - Device ID
 * @property {"online"|"offline"} status - Device status
 * @property {string} lastSeenAt - ISO timestamp
 */

// Create event bus instance
const deviceEventBus = new EventEmitter();

/**
 * Emit a Device Engine event
 * Broadcasts to both internal event bus and SSE stream
 * 
 * @param {Object} event - DeviceEngineEvent
 * @param {string} event.type - Event type
 * @param {Object} event.payload - Event payload
 */
export function emitDeviceEvent(event) {
  const { type, payload } = event;
  
  console.log(`[DeviceEngine Event] 🔔 Emitting ${type}`, {
    sessionId: payload.sessionId || payload.deviceId,
    code: payload.code,
    engine: payload.engine,
    deviceType: payload.deviceType,
    tenantId: payload.tenantId,
    storeId: payload.storeId,
  });
  
  // Emit to internal event bus (for any internal subscribers)
  deviceEventBus.emit('device_engine_event', event);
  console.log(`[DeviceEngine Event] ✅ Emitted to internal event bus: ${type}`);
  
  // Broadcast to SSE stream for dashboard consumption
  // Use the actual event type (e.g., 'device.pairing.claimed') as the SSE event type
  // This allows dashboards to listen for specific events using addEventListener
  try {
    const sseData = {
      type,
      payload,
    };
    
    console.log(`[DeviceEngine Event] 📡 Broadcasting to SSE: ${type}`, {
      eventType: type,
      sessionId: payload.sessionId || payload.deviceId,
      code: payload.code,
      key: 'admin',
      payloadKeys: Object.keys(payload || {}),
    });
    
    // Broadcast using the actual event type (e.g., 'device.pairing.claimed')
    // This allows dashboards to listen with: es.addEventListener('device.pairing.claimed', ...)
    // OR listen to 'message' events and check data.type === 'device.pairing.claimed'
    broadcastSse('admin', type, sseData);
    
    // Also broadcast as 'device_engine_event' for backward compatibility
    broadcastSse('admin', 'device_engine_event', sseData);
    
    // Note: broadcastSse already logs success/failure, so we don't need to log again here
    // But we log before calling to track the attempt
    console.log(`[DeviceEngine Event] ✅✅✅ Sent DeviceEngine event type=${type} to SSE`, {
      sessionId: payload.sessionId || payload.deviceId,
      code: payload.code,
      engine: payload.engine,
      fullPayload: JSON.stringify(sseData).substring(0, 200),
    });
  } catch (error) {
    console.error('[DeviceEngine Event] ❌ Failed to broadcast to SSE:', {
      error: error.message,
      stack: error.stack,
      type,
      sessionId: payload.sessionId || payload.deviceId,
    });
  }
}

/**
 * Get the device event bus for subscribing to events
 * @returns {EventEmitter} Event bus instance
 */
export function getDeviceEventBus() {
  return deviceEventBus;
}

// Export event type constants for type safety
export const DEVICE_ENGINE_EVENT_TYPES = {
  PAIRING_REQUESTED: 'device.pairing.requested',
  PAIRING_CLAIMED: 'device.pairing.claimed',
  STATUS_CHANGED: 'device.status.changed',
};

