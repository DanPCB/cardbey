/**
 * Kernel ingress — Reality Stream append-only store.
 * Phase 1: in-memory sidecar; durable store deferred to Phase 2+.
 */

import { assertRealityEventImmutable } from './laws.js';
import type { RealityStreamEvent, RealityStreamWindow } from './types.js';

/** In-memory store for Phase 0 / dev only. Phase 1+ uses durable stream store. */
const streamEvents = new Map<string, RealityStreamEvent[]>();

/**
 * Append an event to a Reality Stream. Law 1: append-only.
 * @param event
 */
export function appendRealityStreamEvent(event: RealityStreamEvent): RealityStreamEvent {
  assertRealityEventImmutable(event);
  const list = streamEvents.get(event.streamId) ?? [];
  list.push(Object.freeze({ ...event, observations: [...event.observations] }));
  streamEvents.set(event.streamId, list);
  return event;
}

/**
 * Select events in a window (by event id or time bounds).
 * @param window
 */
export function selectStreamWindow(window: RealityStreamWindow): RealityStreamEvent[] {
  const events = streamEvents.get(window.streamId) ?? [];
  if (!window.fromEventId && !window.toEventId && !window.fromTime && !window.toTime) {
    return [...events];
  }

  let startIdx = 0;
  let endIdx = events.length - 1;

  if (window.fromEventId) {
    const idx = events.findIndex((e) => e.eventId === window.fromEventId);
    if (idx >= 0) startIdx = idx;
  }
  if (window.toEventId) {
    const idx = events.findIndex((e) => e.eventId === window.toEventId);
    if (idx >= 0) endIdx = idx;
  }

  let slice = events.slice(startIdx, endIdx + 1);

  if (window.fromTime) {
    const fromMs = Date.parse(window.fromTime);
    slice = slice.filter((e) => Date.parse(e.recordedAt) >= fromMs);
  }
  if (window.toTime) {
    const toMs = Date.parse(window.toTime);
    slice = slice.filter((e) => Date.parse(e.recordedAt) <= toMs);
  }

  return slice;
}

/** Phase 0 test helper. */
export function __clearRealityStreamStoreForTests(): void {
  streamEvents.clear();
}
