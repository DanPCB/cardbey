/**
 * Provenance / field status for business-aware store generation.
 * Additive Phase 1 contract — not wired into generateDraft yet.
 */

/** @typedef {'VERIFIED'|'INFERRED'|'SUGGESTED'|'GENERATED'|'UNKNOWN'|'USER_EDITED'} FieldStatus */

/** @typedef {'uploaded_flyer'|'business_card'|'menu'|'brochure'|'logo'|'photo'|'user_description'|'existing_store'|'website'|'social'|'public_listing'|'uri_resource'|'ocr'|'vision'|'owner_input'|'system_default'|'unknown'} EvidenceSourceType */

/**
 * @template T
 * @typedef {{
 *   value: T,
 *   source?: string | null,
 *   sourceType?: EvidenceSourceType | null,
 *   confidence?: number | null,
 *   status: FieldStatus,
 * }} StoreField
 */

export const FIELD_STATUSES = Object.freeze([
  'VERIFIED',
  'INFERRED',
  'SUGGESTED',
  'GENERATED',
  'UNKNOWN',
  'USER_EDITED',
]);

/**
 * @template T
 * @param {T} value
 * @param {Partial<StoreField<T>>} [meta]
 * @returns {StoreField<T>}
 */
export function storeField(value, meta = {}) {
  const status = FIELD_STATUSES.includes(/** @type {string} */ (meta.status))
    ? meta.status
    : 'UNKNOWN';
  return {
    value,
    source: meta.source ?? null,
    sourceType: meta.sourceType ?? null,
    confidence:
      typeof meta.confidence === 'number' && Number.isFinite(meta.confidence)
        ? Math.max(0, Math.min(1, meta.confidence))
        : null,
    status,
  };
}

/**
 * Suggested/generated must never be treated as verified fact.
 * @param {StoreField<unknown> | null | undefined} field
 */
export function isFactuallyTrusted(field) {
  if (!field || field.value == null) return false;
  return field.status === 'VERIFIED' || field.status === 'USER_EDITED';
}

export default { FIELD_STATUSES, storeField, isFactuallyTrusted };
