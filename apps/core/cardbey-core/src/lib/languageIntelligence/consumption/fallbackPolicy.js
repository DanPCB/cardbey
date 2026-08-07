/**
 * Fail-safe: always prefer canonical original on error / missing / denied.
 */

import { normalizeConsumptionStatus } from './consumptionStatus.js';

/**
 * @param {object} input
 * @param {string} input.originalText
 * @param {string|null|undefined} [input.localizedText]
 * @param {string} [input.status]
 * @param {unknown} [input.error]
 * @returns {{ text: string, status: string, usedFallback: boolean }}
 */
export function applyFallbackToOriginal(input) {
  const original = String(input.originalText ?? '');
  const localized =
    input.localizedText == null || input.localizedText === ''
      ? null
      : String(input.localizedText);
  const status = normalizeConsumptionStatus(input.status, localized ? 'ready' : 'missing');

  if (input.error) {
    return {
      text: original,
      status: 'fallback_original',
      usedFallback: true,
    };
  }

  if (status === 'failed' || status === 'loading' || status === 'opt_in_required') {
    return {
      text: original,
      status: status === 'opt_in_required' ? 'opt_in_required' : 'fallback_original',
      usedFallback: true,
    };
  }

  if (status === 'missing' || localized == null) {
    return {
      text: original,
      status: localized == null ? 'missing' : status,
      usedFallback: localized == null,
    };
  }

  return {
    text: localized,
    status: 'ready',
    usedFallback: false,
  };
}
