/**
 * Translation / localization status for UI consumers.
 */

export const CONSUMPTION_STATUSES = Object.freeze([
  'ready',
  'missing',
  'loading',
  'failed',
  'fallback_original',
  'opt_in_required',
  'same_language',
]);

export const CONSUMPTION_STATUS_SET = new Set(CONSUMPTION_STATUSES);

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isConsumptionStatus(value) {
  return CONSUMPTION_STATUS_SET.has(String(value ?? ''));
}

/**
 * @param {unknown} value
 * @param {string} [fallback]
 */
export function normalizeConsumptionStatus(value, fallback = 'missing') {
  const v = String(value ?? '');
  if (isConsumptionStatus(v)) return v;
  return isConsumptionStatus(fallback) ? fallback : 'missing';
}
