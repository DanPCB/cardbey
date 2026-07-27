/**
 * Signage Engine Events
 * Event emission for signage engine actions
 */

/**
 * Simple event emitter implementation
 * Logs events to console (can be replaced with real event bus)
 */
class SimpleEventEmitter {
  async emit(event, payload) {
    console.log(`[Signage Engine Event] ${event}`, payload);
    // TODO: Integrate with real event bus (e.g., EventLog model, SSE, WebSocket)
  }
}

/**
 * Get event emitter instance
 */
export function getEventEmitter() {
  return new SimpleEventEmitter();
}

/**
 * Event types
 */
export const SIGNAGE_EVENTS = {
  PLAYLIST_CREATED: 'signage.playlist_created',
  SCHEDULED: 'signage.scheduled',
  PUBLISHED: 'signage.published',
};



