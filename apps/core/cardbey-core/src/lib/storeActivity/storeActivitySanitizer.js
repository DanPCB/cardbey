import {
  sanitizePlatformActivityInput,
  sanitizePlatformActivityEvent,
  sanitizeValue,
} from '../platformActivity/platformActivitySanitizer.js';

const FORBIDDEN_METADATA_KEYS =
  /^(email|phone|customername|customer_name|useragent|referrer|ip|address|name|firstName|lastName)$/i;

/**
 * Strip PII from store activity before storage/broadcast.
 * @param {Record<string, unknown>} input
 */
export function sanitizeStoreActivityInput(input) {
  const base = sanitizePlatformActivityInput(input);
  const storeId = String(input.storeId ?? '').trim();
  if (!storeId) throw new Error('storeId required');

  /** @type {Record<string, unknown>} */
  const metadata = {};
  if (input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)) {
    for (const [key, raw] of Object.entries(input.metadata)) {
      if (FORBIDDEN_METADATA_KEYS.test(key)) continue;
      metadata[key] = sanitizeValue(raw);
    }
  }

  return {
    ...base,
    storeId,
    actorId: null,
    metadata,
  };
}

/**
 * @param {import('./storeActivityTypes.js').StoreActivityEvent} event
 */
export function sanitizeStoreActivityEvent(event) {
  const sanitized = sanitizePlatformActivityEvent(event);
  return /** @type {import('./storeActivityTypes.js').StoreActivityEvent} */ ({
    ...sanitized,
    storeId: String(event.storeId),
    actorId: null,
    metadata: sanitizeValue(event.metadata ?? {}),
  });
}
