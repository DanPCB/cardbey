/**
 * Phase 0 — pure shape validators for NormalizedIntentV1 + BuildStoreInputV1.
 * No I/O. Used by golden tests; Phase 1 enqueue may reuse or replace with shared Zod.
 */

/** @param {unknown} v */
function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * @param {unknown} obj
 * @returns {{ ok: true } | { ok: false, errors: string[] }}
 */
export function validateNormalizedIntentV1(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, errors: ['root must be an object'] };
  }
  const o = /** @type {Record<string, unknown>} */ (obj);
  if (o.schemaVersion !== 1) errors.push('schemaVersion must be literal 1');
  if (!isNonEmptyString(o.tool)) errors.push('tool must be a non-empty string');
  if (!o.parameters || typeof o.parameters !== 'object' || Array.isArray(o.parameters)) {
    errors.push('parameters must be an object');
  }
  if (!isNonEmptyString(o.intentText)) errors.push('intentText must be a non-empty string');
  if (!isNonEmptyString(o.originSurface)) errors.push('originSurface must be a non-empty string');
  return errors.length ? { ok: false, errors } : { ok: true };
}

/**
 * @param {unknown} obj
 * @returns {{ ok: true } | { ok: false, errors: string[] }}
 */
export function validateBuildStoreInputV1(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, errors: ['root must be an object'] };
  }
  const o = /** @type {Record<string, unknown>} */ (obj);
  if (o.schemaVersion !== 1) errors.push('schemaVersion must be literal 1');
  if (!isNonEmptyString(o.businessName)) errors.push('businessName must be a non-empty string');
  if (o.businessType != null && typeof o.businessType !== 'string') errors.push('businessType must be string or omitted');
  if (o.storeType != null && typeof o.storeType !== 'string') errors.push('storeType must be string or omitted');
  if (o.location != null && typeof o.location !== 'string') errors.push('location must be string or omitted');
  const im = o.intentMode;
  if (im !== 'store' && im !== 'website') errors.push('intentMode must be store or website');
  if (o.rawUserText != null && typeof o.rawUserText !== 'string') errors.push('rawUserText must be string or omitted');
  if (o.currencyCode != null && typeof o.currencyCode !== 'string') errors.push('currencyCode must be string or omitted');
  return errors.length ? { ok: false, errors } : { ok: true };
}
