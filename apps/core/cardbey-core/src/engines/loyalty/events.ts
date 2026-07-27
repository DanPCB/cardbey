/**
 * Loyalty Engine Events
 * Event emission for loyalty engine actions
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
    console.log(`[Loyalty Engine Event] ${event}`, payload);
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
export const LOYALTY_EVENTS = {
  PROGRAM_CONFIGURED: 'loyalty.program_configured',
  CARD_GENERATED: 'loyalty.card_generated',
  STAMP_ADDED: 'loyalty.stamp_added',
  REWARD_REDEEMED: 'loyalty.reward_redeemed',
} as const;


