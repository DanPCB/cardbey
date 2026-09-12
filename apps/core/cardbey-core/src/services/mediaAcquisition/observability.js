/**
 * In-process observability for media acquisition (no secrets).
 */

const MAX = 200;
/** @type {object[]} */
const events = [];

/**
 * @param {string} type
 * @param {object} payload
 */
export function recordMediaAcquisitionEvent(type, payload = {}) {
  const safe = sanitize(payload);
  const entry = {
    id: `mae_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    type: String(type || 'event'),
    at: new Date().toISOString(),
    ...safe,
  };
  events.unshift(entry);
  if (events.length > MAX) events.length = MAX;
  return entry;
}

export function listMediaAcquisitionEvents({ limit = 50, type } = {}) {
  let rows = events;
  if (type) rows = rows.filter((e) => e.type === type);
  return rows.slice(0, Math.min(100, Math.max(1, Number(limit) || 50)));
}

export function resetMediaAcquisitionEventsForTests() {
  events.length = 0;
}

function sanitize(payload) {
  const out = { ...payload };
  for (const key of Object.keys(out)) {
    const k = key.toLowerCase();
    if (
      k.includes('key') ||
      k.includes('secret') ||
      k.includes('token') ||
      k.includes('authorization') ||
      k.includes('password')
    ) {
      delete out[key];
    }
  }
  return out;
}
