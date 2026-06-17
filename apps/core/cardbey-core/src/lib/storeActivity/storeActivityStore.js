import { MAX_RECENT_BUFFER_PER_STORE } from './storeActivityTypes.js';

/** @type {Map<string, import('./storeActivityTypes.js').StoreActivityEvent[]>} */
const recentByStore = new Map();

/** @type {Map<string, Set<import('express').Response>>} */
const streamClientsByStore = new Map();

function getStoreBuffer(storeId) {
  const key = String(storeId).trim();
  if (!recentByStore.has(key)) recentByStore.set(key, []);
  return recentByStore.get(key);
}

export function isStoreActivityEnabled() {
  const raw = String(process.env.STORE_ACTIVITY_ENABLED ?? 'true').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

/**
 * @param {import('./storeActivityTypes.js').StoreActivityEvent} event
 */
export function storeStoreActivityEvent(event) {
  const buffer = getStoreBuffer(event.storeId);
  buffer.unshift(event);
  if (buffer.length > MAX_RECENT_BUFFER_PER_STORE) {
    buffer.length = MAX_RECENT_BUFFER_PER_STORE;
  }
  return event;
}

/**
 * @param {string} storeId
 * @param {{ limit?: number, since?: string }} [filters]
 */
export function listStoreActivityEvents(storeId, filters = {}) {
  const limit = Math.min(Math.max(Number(filters.limit) || 40, 1), 100);
  const sinceMs = filters.since ? Date.parse(filters.since) : NaN;
  let rows = getStoreBuffer(storeId);
  if (Number.isFinite(sinceMs)) {
    rows = rows.filter((e) => Date.parse(e.createdAt) >= sinceMs);
  }
  return rows.slice(0, limit);
}

/**
 * @param {string} storeId
 * @param {import('express').Response} res
 */
export function addStoreActivityStreamClient(storeId, res) {
  const key = String(storeId).trim();
  if (!streamClientsByStore.has(key)) streamClientsByStore.set(key, new Set());
  const clients = streamClientsByStore.get(key);
  clients.add(res);
  res.on('close', () => {
    clients.delete(res);
    if (clients.size === 0) streamClientsByStore.delete(key);
  });
}

/**
 * @param {import('./storeActivityTypes.js').StoreActivityEvent} event
 */
export function broadcastStoreActivityEvent(event) {
  const clients = streamClientsByStore.get(String(event.storeId).trim());
  if (!clients || clients.size === 0) return;

  const payload = JSON.stringify(event);
  const line = `event: store-activity\ndata: ${payload}\n\n`;
  const dead = [];

  for (const res of clients) {
    if (res.writableEnded || res.destroyed) {
      dead.push(res);
      continue;
    }
    try {
      res.write(line);
    } catch {
      dead.push(res);
    }
  }
  for (const res of dead) clients.delete(res);
}

/** Test helper */
export function clearStoreActivityStoreForTests() {
  recentByStore.clear();
  streamClientsByStore.clear();
}

/** Test helper */
export function getStoreActivityStreamClientCount(storeId) {
  return streamClientsByStore.get(String(storeId).trim())?.size ?? 0;
}
