/**
 * In-process discovery event bus — foundation only.
 * Future: bridge to queue / webhook consumers without changing event contracts.
 */

import { isBusinessDiscoveryEventsV1Enabled } from '../flags.js';
import { assertDiscoveryEvent, buildDiscoveryEvent } from '../contracts/discoveryEvent.js';

/** @type {Map<string, Set<Function>>} */
const listeners = new Map();

/** @type {import('../contracts/discoveryEvent.js').DiscoveryEvent[]} */
let recentEvents = [];
const MAX_RECENT = 200;

/**
 * @param {string} type
 * @param {(event: import('../contracts/discoveryEvent.js').DiscoveryEvent) => void} handler
 * @returns {() => void} unsubscribe
 */
export function subscribeDiscoveryEvent(type, handler) {
  if (typeof handler !== 'function') {
    throw new Error('[businessDiscoveryLayer] handler must be a function');
  }
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(handler);
  return () => {
    listeners.get(type)?.delete(handler);
  };
}

/**
 * @param {import('../contracts/discoveryEvent.js').DiscoveryEvent | object} eventOrParams
 * @returns {{ ok: true, event: import('../contracts/discoveryEvent.js').DiscoveryEvent } | { ok: false, reason: string }}
 */
export function emitDiscoveryEvent(eventOrParams) {
  if (!isBusinessDiscoveryEventsV1Enabled()) {
    return { ok: false, reason: 'business_discovery_events_disabled' };
  }

  let event;
  try {
    event =
      eventOrParams && typeof eventOrParams === 'object' && 'occurredAt' in eventOrParams
        ? assertDiscoveryEvent(eventOrParams)
        : buildDiscoveryEvent(eventOrParams);
  } catch (err) {
    return {
      ok: false,
      reason: 'invalid_discovery_event',
      error: err instanceof Error ? err.message : String(err),
    };
  }

  recentEvents.push(event);
  if (recentEvents.length > MAX_RECENT) {
    recentEvents = recentEvents.slice(-MAX_RECENT);
  }

  const typeHandlers = listeners.get(event.type);
  if (typeHandlers) {
    for (const handler of typeHandlers) {
      try {
        handler(event);
      } catch {
        // Never let a consumer break emission.
      }
    }
  }
  const wildcard = listeners.get('*');
  if (wildcard) {
    for (const handler of wildcard) {
      try {
        handler(event);
      } catch {
        // ignore
      }
    }
  }

  return { ok: true, event };
}

/** @returns {import('../contracts/discoveryEvent.js').DiscoveryEvent[]} */
export function listRecentDiscoveryEvents() {
  return [...recentEvents];
}

export function clearDiscoveryEventBusForTests() {
  listeners.clear();
  recentEvents = [];
}
