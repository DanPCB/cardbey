/**
 * Menu Engine Events
 * Event emission for menu engine actions
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
    console.log(`[Menu Engine Event] ${event}`, payload);
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
export const MENU_EVENTS = {
  MENU_EXTRACTED: 'menu.menu_extracted',
  MENU_CONFIGURED: 'menu.menu_configured',
  SIGNAGE_GENERATED: 'menu.signage_generated',
  MENU_PUBLISHED: 'menu.published',
} as const;



