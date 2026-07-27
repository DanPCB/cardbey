import { randomUUID } from 'node:crypto';
import {
  DEDUPE_WINDOW_MS,
  EVENT_TYPE_CATEGORY,
  EVENT_TYPE_DEFAULT_MESSAGE,
  EVENT_TYPE_DEFAULT_SEVERITY,
  EVENT_TYPE_DEFAULT_TITLE,
  STORE_ACTIVITY_TYPES,
} from './storeActivityTypes.js';
import { sanitizeStoreActivityInput } from './storeActivitySanitizer.js';
import {
  broadcastStoreActivityEvent,
  isStoreActivityEnabled,
  storeStoreActivityEvent,
} from './storeActivityStore.js';

/** @type {Map<string, number>} */
const dedupeCache = new Map();

const VALID_SEVERITIES = new Set(['info', 'success', 'warning', 'critical']);
const VALID_ACTOR_TYPES = new Set(['user', 'system', 'admin', 'device', 'performer']);

function pruneDedupeCache(now) {
  for (const [key, ts] of dedupeCache) {
    if (now - ts > DEDUPE_WINDOW_MS) dedupeCache.delete(key);
  }
}

function shouldDedupe(storeId, type, entityType, entityId) {
  const key = `${storeId}:${type}:${entityType ?? ''}:${entityId ?? ''}`;
  const now = Date.now();
  pruneDedupeCache(now);
  const last = dedupeCache.get(key);
  if (last != null && now - last < DEDUPE_WINDOW_MS) return true;
  dedupeCache.set(key, now);
  return false;
}

/**
 * Emit a store-scoped activity event for Live Performance SSE.
 * @param {Record<string, unknown>} input
 * @returns {import('./storeActivityTypes.js').StoreActivityEvent | null}
 */
export function emitStoreActivity(input) {
  if (!isStoreActivityEnabled()) return null;

  try {
    const sanitized = sanitizeStoreActivityInput(input);
    const storeId = sanitized.storeId;
    const type = String(sanitized.type ?? '').trim();
    if (!STORE_ACTIVITY_TYPES.has(type)) {
      throw new Error(`invalid store activity type: ${type}`);
    }

    const category = sanitized.category || EVENT_TYPE_CATEGORY[type] || 'store_engagement';
    const severity = VALID_SEVERITIES.has(sanitized.severity)
      ? sanitized.severity
      : EVENT_TYPE_DEFAULT_SEVERITY[type] || 'info';
    const actorType = VALID_ACTOR_TYPES.has(sanitized.actorType) ? sanitized.actorType : 'system';
    const title = String(sanitized.title || EVENT_TYPE_DEFAULT_TITLE[type] || 'Store activity').trim();
    const message = String(sanitized.message || EVENT_TYPE_DEFAULT_MESSAGE[type] || '').trim();
    const entityType = sanitized.entityType != null ? String(sanitized.entityType).slice(0, 40) : null;
    const entityId = sanitized.entityId != null ? String(sanitized.entityId).slice(0, 80) : null;

    if (shouldDedupe(storeId, type, entityType, entityId)) return null;

    /** @type {import('./storeActivityTypes.js').StoreActivityEvent} */
    const event = {
      id: randomUUID(),
      storeId,
      type,
      category,
      severity,
      actorType,
      actorId: null,
      entityType,
      entityId,
      title,
      message,
      route: sanitized.route != null ? String(sanitized.route).slice(0, 200) : '/live-performance',
      actionLabel:
        (typeof sanitized.actionLabel === 'string' && sanitized.actionLabel.trim()) || 'Open',
      region: sanitized.region != null ? String(sanitized.region).slice(0, 80) : null,
      createdAt: new Date().toISOString(),
      metadata: sanitized.metadata ?? {},
    };

    storeStoreActivityEvent(event);
    broadcastStoreActivityEvent(event);

    if (process.env.NODE_ENV !== 'production') {
      console.log('[StoreActivity]', { storeId, type: event.type, severity: event.severity });
    }

    return event;
  } catch (err) {
    console.warn('[StoreActivity] emit failed (non-fatal)', err?.message || err);
    return null;
  }
}

/** Test helper */
export function clearStoreActivityEmitterForTests() {
  dedupeCache.clear();
}

export const storeActivity = { emit: emitStoreActivity };
