/**
 * Single source of truth: which legacy flat payload keys map into first-class normalized fields.
 * All other legacy keys are classified as metadata (still round-tripped at flat root on serialize).
 *
 * Do not duplicate these sets in routes, run handlers, or serializers.
 */

/** Server-authoritative max stored length for intent payload `message` (aligns with mi_assistant_message /run slice). */
export const INTENT_MESSAGE_MAX_LENGTH = 4096;

export const DEFAULT_INTENT_SOURCE = 'mi_assistant';

/** Structured body discriminator (public contract; optional for clients). */
export const STRUCTURED_PAYLOAD_VERSION = 1;

/** Maps to normalized.contextRefs */
export const LEGACY_CONTEXT_KEYS = new Set(['storeId', 'draftId', 'generationRunId', 'campaignId']);

/** Maps to normalized.entityRefs */
export const LEGACY_ENTITY_KEYS = new Set([
  'entityType',
  'entityId',
  'productId',
  'productName',
  'categoryId',
  'categoryLabel',
]);

/** Maps to normalized.message / normalized.source */
export const LEGACY_CORE_KEYS = new Set(['message', 'source']);

/**
 * @param {string} key
 * @returns {'context' | 'entity' | 'core' | 'metadata'}
 */
export function legacyPayloadKeyBucket(key) {
  if (LEGACY_CONTEXT_KEYS.has(key)) return 'context';
  if (LEGACY_ENTITY_KEYS.has(key)) return 'entity';
  if (LEGACY_CORE_KEYS.has(key)) return 'core';
  return 'metadata';
}

/**
 * Structured shape: explicit version 1 (see SERVER_INTENT_ENTRY_CONTRACT_V1 design doc).
 * @param {unknown} payload
 * @returns {payload is Record<string, unknown>}
 */
export function isStructuredMissionIntentPayload(payload) {
  return (
    payload != null &&
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    payload.version === STRUCTURED_PAYLOAD_VERSION
  );
}
