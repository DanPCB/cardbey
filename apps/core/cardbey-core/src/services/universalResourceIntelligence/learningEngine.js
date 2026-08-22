/**
 * Learning Engine — records feedback signals; never modifies rights.
 */

/** @type {object[]} */
const events = [];

export function recordLearningEvent(event = {}) {
  const row = {
    id: `learn_${Date.now().toString(36)}_${events.length}`,
    type: event.type || 'feedback',
    resourceId: event.resourceId || null,
    intentId: event.intentId || null,
    signal: event.signal || null, // reuse | dismiss | download | edit | moderation | business_success
    payload: event.payload || {},
    createdAt: new Date().toISOString(),
    rightsUntouched: true,
  };
  events.push(row);
  return { ok: true, event: row };
}

export function listLearningEvents({ limit = 50 } = {}) {
  return events.slice(-Math.min(Math.max(Number(limit) || 50, 1), 200)).reverse();
}

export function learningSummary() {
  const bySignal = {};
  for (const e of events) {
    bySignal[e.signal || 'unknown'] = (bySignal[e.signal || 'unknown'] || 0) + 1;
  }
  return {
    total: events.length,
    bySignal,
    improves: ['ranking', 'metadata', 'recommendations'],
    neverModifies: ['rights'],
  };
}

export function resetLearningForTests() {
  events.length = 0;
}
