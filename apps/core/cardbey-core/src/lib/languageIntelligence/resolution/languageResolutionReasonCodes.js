/**
 * Reason codes for auto language resolution (explainable, privacy-safe).
 */

export const LANGUAGE_REASON_CODES = Object.freeze({
  LANGUAGE_EXPLICIT_SESSION: 'LANGUAGE_EXPLICIT_SESSION',
  LANGUAGE_ACCOUNT_MANUAL: 'LANGUAGE_ACCOUNT_MANUAL',
  /** Soft account preferredLanguage when manualLanguageSelection is false */
  LANGUAGE_ACCOUNT_PREFERRED: 'LANGUAGE_ACCOUNT_PREFERRED',
  LANGUAGE_VISITOR_SAVED: 'LANGUAGE_VISITOR_SAVED',
  LANGUAGE_BROWSER_EXACT_MATCH: 'LANGUAGE_BROWSER_EXACT_MATCH',
  LANGUAGE_BROWSER_BASE_MATCH: 'LANGUAGE_BROWSER_BASE_MATCH',
  LANGUAGE_BROWSER_REGIONAL_VARIANT: 'LANGUAGE_BROWSER_REGIONAL_VARIANT',
  LANGUAGE_DEVICE_MATCH: 'LANGUAGE_DEVICE_MATCH',
  LANGUAGE_REGION_FALLBACK: 'LANGUAGE_REGION_FALLBACK',
  LANGUAGE_STORE_FALLBACK: 'LANGUAGE_STORE_FALLBACK',
  LANGUAGE_GLOBAL_FALLBACK: 'LANGUAGE_GLOBAL_FALLBACK',
  LANGUAGE_UNSUPPORTED_REJECTED: 'LANGUAGE_UNSUPPORTED_REJECTED',
});

/**
 * Map internal source → confidence band.
 * @param {string} source
 * @param {string} reasonCode
 * @returns {'explicit'|'high'|'medium'|'fallback'}
 */
export function confidenceForSource(source, reasonCode) {
  if (
    source === 'explicit_session' ||
    source === 'visitor_preference' ||
    reasonCode === LANGUAGE_REASON_CODES.LANGUAGE_EXPLICIT_SESSION ||
    reasonCode === LANGUAGE_REASON_CODES.LANGUAGE_ACCOUNT_MANUAL ||
    reasonCode === LANGUAGE_REASON_CODES.LANGUAGE_VISITOR_SAVED
  ) {
    return 'explicit';
  }
  if (
    reasonCode === LANGUAGE_REASON_CODES.LANGUAGE_ACCOUNT_PREFERRED ||
    reasonCode === LANGUAGE_REASON_CODES.LANGUAGE_BROWSER_EXACT_MATCH ||
    reasonCode === LANGUAGE_REASON_CODES.LANGUAGE_DEVICE_MATCH ||
    reasonCode === LANGUAGE_REASON_CODES.LANGUAGE_BROWSER_REGIONAL_VARIANT
  ) {
    return 'high';
  }
  if (reasonCode === LANGUAGE_REASON_CODES.LANGUAGE_BROWSER_BASE_MATCH) {
    return 'medium';
  }
  return 'fallback';
}
