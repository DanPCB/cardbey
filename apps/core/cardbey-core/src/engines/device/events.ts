/**
 * Device Engine Events
 * Event emission for device engine actions
 */

/**
 * Event emitter interface
 * In a real implementation, this would connect to your event bus
 */
export interface EventEmitter {
  emit(event: string, payload: Record<string, unknown>): Promise<void> | void;
}

/**
 * Simple event emitter implementation
 * Logs events to console (can be replaced with real event bus)
 */
class SimpleEventEmitter implements EventEmitter {
  async emit(event: string, payload: Record<string, unknown>): Promise<void> {
    console.log(`[Device Engine Event] ${event}`, payload);
    // TODO: Integrate with real event bus (e.g., EventLog model, SSE, WebSocket)
  }
}

/**
 * Get event emitter instance
 */
export function getEventEmitter(): EventEmitter {
  return new SimpleEventEmitter();
}

/**
 * Event types
 */
export const DEVICE_EVENTS = {
  PAIRED: 'device.paired',
  HEARTBEAT_RECEIVED: 'device.heartbeat_received',
  OFFLINE_DETECTED: 'device.offline_detected',
  PLAYLIST_READY: 'device.playlist_ready',
  REPAIR_STARTED: 'device.repair_started',
  REPAIR_COMPLETED: 'device.repair_completed',
} as const;

