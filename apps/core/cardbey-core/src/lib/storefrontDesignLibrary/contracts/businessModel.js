/**
 * Canonical business-model vocabulary for blueprint / preview matching.
 * Phase 1 — vocabulary only (no scoring).
 */

export const BUSINESS_MODELS = Object.freeze([
  'service_quote',
  'service_booking',
  'retail',
  'restaurant',
  'portfolio',
  'mixed',
]);

export const BUSINESS_MODEL_SET = new Set(BUSINESS_MODELS);

/** @param {unknown} model */
export function isBusinessModel(model) {
  return typeof model === 'string' && BUSINESS_MODEL_SET.has(model);
}
