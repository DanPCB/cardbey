/**
 * Promo Engine Events
 * Event emission for promo engine actions
 */

/**
 * Simple event emitter implementation
 * Logs events to console (can be replaced with real event bus)
 */
class SimpleEventEmitter {
  async emit(event: string, payload: unknown): Promise<void> {
    console.log(`[Promo Engine Event] ${event}`, payload);
    // TODO: Integrate with real event bus (e.g., EventLog model, SSE, WebSocket)
  }
}

/**
 * Get event emitter instance
 */
export function getEventEmitter(): SimpleEventEmitter {
  return new SimpleEventEmitter();
}

/**
 * Event types
 */
export const PROMO_EVENTS = {
  PROMO_CONFIGURED: 'promo.promo_configured',
  PROMO_ACTIVATED: 'promo.promo_activated',
  PROMO_REDEEMED: 'promo.redeemed',
} as const;
