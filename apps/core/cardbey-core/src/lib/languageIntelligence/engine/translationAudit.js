/**
 * TranslationAudit — append-only in-process history for diagnostics / review.
 * Not a durable DB in Phase 2; records are also returned to callers for persistence later.
 */

/** @type {Array<Record<string, unknown>>} */
const events = [];
const MAX_EVENTS = 2000;

/**
 * @param {string} type
 * @param {Record<string, unknown>} payload
 */
export function appendTranslationAudit(type, payload = {}) {
  const event = Object.freeze({
    type: String(type),
    timestamp: new Date().toISOString(),
    ...payload,
  });
  events.push(event);
  if (events.length > MAX_EVENTS) {
    events.splice(0, events.length - MAX_EVENTS);
  }
  return event;
}

/**
 * @param {{ limit?: number, entityId?: string, type?: string }} [filter]
 */
export function listTranslationAudit(filter = {}) {
  const limit = Math.min(Math.max(Number(filter.limit) || 100, 1), 500);
  let list = events;
  if (filter.entityId) {
    list = list.filter((e) => e.entityId === filter.entityId);
  }
  if (filter.type) {
    list = list.filter((e) => e.type === filter.type);
  }
  return Object.freeze(list.slice(-limit));
}

/** @internal */
export function __resetTranslationAuditForTests() {
  events.length = 0;
}

export function getTranslationAuditStats() {
  return Object.freeze({
    eventCount: events.length,
    maxEvents: MAX_EVENTS,
  });
}
