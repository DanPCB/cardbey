/**
 * Discovery Agent operational result codes + skip reasons (Diagnostics V2).
 * Operator-facing; never store secrets here.
 */

export const RESULT_CODES = Object.freeze({
  SUCCESS: 'SUCCESS',
  NO_RESULTS: 'NO_RESULTS',
  SKIPPED: 'SKIPPED',
  PARTIAL: 'PARTIAL',
  PROVIDER_BLOCKED: 'PROVIDER_BLOCKED',
  RATE_LIMITED: 'RATE_LIMITED',
  AUTH_ERROR: 'AUTH_ERROR',
  CONFIG_ERROR: 'CONFIG_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  PARSE_ERROR: 'PARSE_ERROR',
  UPSTREAM_ERROR: 'UPSTREAM_ERROR',
  INVALID_SOURCE: 'INVALID_SOURCE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
});

export const SKIP_REASONS = Object.freeze({
  DUPLICATE: 'DUPLICATE',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA',
  NOT_BUSINESS: 'NOT_BUSINESS',
  FILTERED_BY_POLICY: 'FILTERED_BY_POLICY',
  INVALID_URL: 'INVALID_URL',
  NO_ACTIONABLE_DATA: 'NO_ACTIONABLE_DATA',
});

export const HEALTH = Object.freeze({
  HEALTHY: 'HEALTHY',
  DEGRADED: 'DEGRADED',
  BLOCKED: 'BLOCKED',
  MISCONFIGURED: 'MISCONFIGURED',
  FAILING: 'FAILING',
  UNKNOWN: 'UNKNOWN',
});

/** Codes that should not burn automatic cron retries until the seed is edited. */
export const NON_RETRYABLE_CODES = new Set([
  RESULT_CODES.AUTH_ERROR,
  RESULT_CODES.CONFIG_ERROR,
  RESULT_CODES.INVALID_SOURCE,
  RESULT_CODES.PROVIDER_BLOCKED,
]);

export const RETRYABLE_CODES = new Set([
  RESULT_CODES.NETWORK_ERROR,
  RESULT_CODES.RATE_LIMITED,
  RESULT_CODES.UPSTREAM_ERROR,
]);

/**
 * @param {string} code
 * @returns {string}
 */
export function operatorActionForCode(code) {
  switch (code) {
    case RESULT_CODES.CONFIG_ERROR:
      return 'Fix source configuration. For Google Maps free-text search: use a Place URL (https://maps.google.com/…) — seed resolve does not call Places API. Or switch to Website → Direct URLs.';
    case RESULT_CODES.AUTH_ERROR:
      return 'Credential rejected by provider. Check Core environment credentials for this provider.';
    case RESULT_CODES.INVALID_SOURCE:
      return 'Source value is invalid for this type. Edit Value to a supported URL or format.';
    case RESULT_CODES.RATE_LIMITED:
      return 'Wait until the provider rate limit resets, then Run Now or wait for the next schedule.';
    case RESULT_CODES.PROVIDER_BLOCKED:
      return 'Hashtag/directory discovery is blocked from this runtime. Direct profile/page URL processing remains available (url_list / Website Direct URLs).';
    case RESULT_CODES.PARSE_ERROR:
      return 'Provider response changed or could not be parsed. Resolver may need maintenance.';
    case RESULT_CODES.NETWORK_ERROR:
      return 'Transient network failure. Automatic retries may apply on the next schedule.';
    case RESULT_CODES.NO_RESULTS:
      return 'Provider responded but no candidate URLs were found. Try a different query or use Direct URLs.';
    case RESULT_CODES.UPSTREAM_ERROR:
      return 'Upstream provider returned an error. Retry later; check provider status if it persists.';
    case RESULT_CODES.INTERNAL_ERROR:
      return 'Internal Cardbey error. Check Core logs for this batch id.';
    case RESULT_CODES.PARTIAL:
      return 'Some URLs succeeded and some failed. Open run details for per-URL results.';
    case RESULT_CODES.SKIPPED:
      return 'No new stores created — candidates were skipped (e.g. already exist).';
    case RESULT_CODES.SUCCESS:
      return 'No action needed.';
    default:
      return 'Review run details and fix the source or wait for a retryable condition.';
  }
}

/**
 * @param {string} code
 * @returns {boolean}
 */
export function isRetryableCode(code) {
  if (NON_RETRYABLE_CODES.has(code)) return false;
  if (RETRYABLE_CODES.has(code)) return true;
  return code !== RESULT_CODES.SUCCESS && code !== RESULT_CODES.SKIPPED && code !== RESULT_CODES.NO_RESULTS;
}
