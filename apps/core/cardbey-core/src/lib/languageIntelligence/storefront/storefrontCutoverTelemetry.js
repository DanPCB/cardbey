/**
 * Privacy-safe storefront cutover telemetry (Stage 4).
 * Never logs business content or translated text.
 */

import { createHash } from 'node:crypto';

/** @type {Array<{ event: string, at: string, payload: object }>} */
const buffer = [];
const MAX = 200;

/**
 * @param {string|null|undefined} storeId
 */
export function hashStoreId(storeId) {
  if (!storeId) return undefined;
  return createHash('sha256').update(String(storeId)).digest('hex').slice(0, 16);
}

/**
 * @param {string} event
 * @param {Record<string, unknown>} payload
 */
export function emitStorefrontCutoverTelemetry(event, payload = {}) {
  const safe = Object.freeze({
    surface: 'public_storefront_v1',
    storeIdHash: payload.storeIdHash ?? hashStoreId(/** @type {string} */ (payload.storeId)),
    requestedLanguage: payload.requestedLanguage ?? null,
    renderedLanguage: payload.renderedLanguage ?? null,
    displayMode: payload.displayMode ?? null,
    translationStatus: payload.translationStatus ?? null,
    fallbackFieldCount: Number(payload.fallbackFieldCount) || 0,
    source: payload.source ?? null,
    featureEnabled: Boolean(payload.featureEnabled),
    reasonCode: payload.reasonCode ?? null,
    shadow: Boolean(payload.shadow),
  });
  // Drop raw storeId from log payload
  const row = Object.freeze({
    event: String(event),
    at: new Date().toISOString(),
    payload: safe,
  });
  buffer.push(row);
  if (buffer.length > MAX) buffer.shift();
  if (process.env.NODE_ENV !== 'production') {
    console.info(`[LI.storefrontCutover] ${event}`, safe);
  }
  return row;
}

export function listStorefrontCutoverTelemetry(limit = 50) {
  return Object.freeze(buffer.slice(-Math.max(1, limit)));
}

/** @internal */
export function __resetStorefrontCutoverTelemetryForTests() {
  buffer.length = 0;
}
