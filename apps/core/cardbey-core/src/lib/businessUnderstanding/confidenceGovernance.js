/**
 * Confidence governance — every extracted property carries value, confidence, source.
 * Inferred values are never truth until owner approval upgrades source to APPROVED.
 */

/** @typedef {import('./businessUnderstandingTypes.js').ConfidenceSource} ConfidenceSource */

/**
 * @template T
 * @param {T} value
 * @param {number} confidence
 * @param {ConfidenceSource} [source]
 */
export function governed(value, confidence, source = 'INFERRED') {
  return {
    value,
    confidence: clampConfidence(confidence),
    source,
  };
}

/**
 * @param {number} n
 */
export function clampConfidence(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

/**
 * @param {{ value?: unknown; confidence?: number; source?: ConfidenceSource } | null | undefined} field
 */
export function isApprovedField(field) {
  return field?.source === 'APPROVED' || field?.source === 'OWNER_EDITED';
}

/**
 * @param {{ value?: unknown; confidence?: number; source?: ConfidenceSource } | null | undefined} field
 * @param {number} [minConfidence]
 */
export function isAuthoritativeField(field, minConfidence = 0.85) {
  if (!field || field.value == null) return false;
  if (isApprovedField(field)) return true;
  if (field.source === 'OBSERVED' && clampConfidence(field.confidence) >= minConfidence) return true;
  return false;
}

/**
 * Owner approval upgrades inferred → approved without changing value.
 *
 * @template T
 * @param {{ value: T; confidence: number; source: ConfidenceSource } | null | undefined} field
 */
export function upgradeToApproved(field) {
  if (!field || field.value == null) return field ?? null;
  return {
    ...field,
    source: /** @type {ConfidenceSource} */ ('APPROVED'),
    confidence: Math.max(clampConfidence(field.confidence), 0.95),
  };
}

/**
 * @param {Record<string, { value?: unknown; confidence?: number; source?: ConfidenceSource } | null | undefined>} profile
 */
export function upgradeBrandProfileToApproved(profile) {
  if (!profile || typeof profile !== 'object') return profile;
  /** @type {Record<string, unknown>} */
  const out = { ...profile };
  for (const key of Object.keys(out)) {
    const field = out[key];
    if (field && typeof field === 'object' && 'value' in field && 'source' in field) {
      out[key] = upgradeToApproved(/** @type {{ value: unknown; confidence: number; source: ConfidenceSource }} */ (field));
    }
  }
  return out;
}

export default {
  governed,
  clampConfidence,
  isApprovedField,
  isAuthoritativeField,
  upgradeToApproved,
  upgradeBrandProfileToApproved,
};
