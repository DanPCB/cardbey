import { randomUUID } from 'node:crypto';
import { EVENT_TYPE_ACTION_LABEL } from './platformActivityActionLabels.js';
import { EVENT_TYPE_DEFAULT_ROUTE } from './platformActivityDefaultRoutes.js';
import {
  DEDUPE_WINDOW_MS,
  EVENT_TYPE_CATEGORY,
  EVENT_TYPE_DEFAULT_SEVERITY,
} from './platformActivityTypes.js';
import { sanitizePlatformActivityInput } from './platformActivitySanitizer.js';
import {
  broadcastPlatformActivityEvent,
  isPlatformActivityEnabled,
  storePlatformActivityEvent,
} from './platformActivityStore.js';

/** @type {Map<string, number>} */
const dedupeCache = new Map();

const VALID_SEVERITIES = new Set(['info', 'success', 'warning', 'critical']);
const VALID_ACTOR_TYPES = new Set(['user', 'system', 'admin', 'device', 'performer']);

function pruneDedupeCache(now) {
  for (const [key, ts] of dedupeCache) {
    if (now - ts > DEDUPE_WINDOW_MS) dedupeCache.delete(key);
  }
}

function shouldDedupe(type, entityType, entityId) {
  if (!entityId) return false;
  const key = `${type}:${entityType ?? ''}:${entityId}`;
  const now = Date.now();
  pruneDedupeCache(now);
  const last = dedupeCache.get(key);
  if (last != null && now - last < DEDUPE_WINDOW_MS) return true;
  dedupeCache.set(key, now);
  return false;
}

/**
 * Emit a platform-wide activity event for Super Admin Control Center.
 * @param {Record<string, unknown>} input
 * @returns {import('./platformActivityTypes.js').PlatformActivityEvent | null}
 */
export function emitPlatformActivity(input) {
  if (!isPlatformActivityEnabled()) return null;

  try {
    const sanitized = sanitizePlatformActivityInput(input);
    const type = sanitized.type;
    const category = sanitized.category || EVENT_TYPE_CATEGORY[type] || 'system_admin';
    const severity = VALID_SEVERITIES.has(sanitized.severity)
      ? sanitized.severity
      : EVENT_TYPE_DEFAULT_SEVERITY[type] || 'info';
    const actorType = VALID_ACTOR_TYPES.has(sanitized.actorType) ? sanitized.actorType : 'system';

    if (shouldDedupe(type, sanitized.entityType, sanitized.entityId)) {
      return null;
    }

    /** @type {import('./platformActivityTypes.js').PlatformActivityEvent} */
    const event = {
      id: randomUUID(),
      type,
      category,
      severity,
      actorType,
      actorId: sanitized.actorId,
      entityType: sanitized.entityType,
      entityId: sanitized.entityId,
      title: sanitized.title,
      message: sanitized.message,
      route: sanitized.route || EVENT_TYPE_DEFAULT_ROUTE[type] || null,
      actionLabel:
        (typeof sanitized.actionLabel === 'string' && sanitized.actionLabel.trim()) ||
        EVENT_TYPE_ACTION_LABEL[type] ||
        'Open',
      region: sanitized.region,
      createdAt: new Date().toISOString(),
      metadata: sanitized.metadata ?? {},
    };

    storePlatformActivityEvent(event);
    broadcastPlatformActivityEvent(event);

    if (process.env.NODE_ENV !== 'production') {
      console.log('[PlatformActivity]', { type: event.type, severity: event.severity, entityId: event.entityId });
    }

    return event;
  } catch (err) {
    console.warn('[PlatformActivity] emit failed (non-fatal)', err?.message || err);
    return null;
  }
}

/** Convenience alias */
export const platformActivity = { emit: emitPlatformActivity };
