/**
 * Classify discovery resolve/scrape failures into operational result codes.
 */

import {
  RESULT_CODES,
  SKIP_REASONS,
  isRetryableCode,
} from './discoveryResultCodes.js';

const BLOCK_MARKERS = [
  'captcha',
  'challenge',
  'verify you are human',
  'access denied',
  'permission denied',
  'login to continue',
  'please log in',
  'unusual traffic',
  'are you a robot',
  'security check',
];

/**
 * @param {string} html
 * @returns {boolean}
 */
export function looksLikeProviderBlockPage(html) {
  const lower = String(html || '').toLowerCase();
  if (!lower) return false;
  return BLOCK_MARKERS.some((m) => lower.includes(m));
}

/**
 * @param {{ status?: number | null, html?: string, error?: string | null, networkFailed?: boolean }} meta
 */
export function classifyHttpFetch(meta = {}) {
  const status = meta.status == null ? null : Number(meta.status);
  if (meta.networkFailed) {
    return {
      code: RESULT_CODES.NETWORK_ERROR,
      message: meta.error || 'Network request failed',
      retryable: true,
      httpStatus: status,
    };
  }
  if (status === 401 || status === 403) {
    return {
      code: RESULT_CODES.PROVIDER_BLOCKED,
      message: `Provider rejected request (HTTP ${status})`,
      retryable: false,
      httpStatus: status,
    };
  }
  if (status === 429) {
    return {
      code: RESULT_CODES.RATE_LIMITED,
      message: 'Provider rate limited the request (HTTP 429)',
      retryable: true,
      httpStatus: status,
    };
  }
  if (status != null && status >= 500) {
    return {
      code: RESULT_CODES.UPSTREAM_ERROR,
      message: `Upstream error (HTTP ${status})`,
      retryable: true,
      httpStatus: status,
    };
  }
  if (status != null && status >= 400) {
    return {
      code: RESULT_CODES.PROVIDER_BLOCKED,
      message: `Provider returned HTTP ${status}`,
      retryable: false,
      httpStatus: status,
    };
  }
  const html = String(meta.html || '');
  if (!html.trim()) {
    return {
      code: RESULT_CODES.PROVIDER_BLOCKED,
      message: 'Empty provider response — cloud/server crawlers are often blocked',
      retryable: false,
      httpStatus: status,
    };
  }
  if (looksLikeProviderBlockPage(html)) {
    return {
      code: RESULT_CODES.PROVIDER_BLOCKED,
      message: 'Provider returned a challenge / login / block page',
      retryable: false,
      httpStatus: status,
    };
  }
  return null;
}

/**
 * Google Maps seed resolve — no Places API; free-text is misconfiguration.
 * @param {string} value
 */
export function classifyGoogleMapsResolve(value) {
  const v = String(value || '').trim();
  if (!v) {
    return {
      code: RESULT_CODES.INVALID_SOURCE,
      message: 'Google Maps seed Value is empty',
      retryable: false,
    };
  }
  if (v.startsWith('http')) {
    return null;
  }
  return {
    code: RESULT_CODES.CONFIG_ERROR,
    message:
      'google_maps seed resolve does not call Places API. Free-text queries (e.g. “Nails and beauty services”) cannot be resolved. Use a Google Maps Place URL (https://…) or switch to Website → Direct URLs.',
    retryable: false,
  };
}

/**
 * TikTok hashtag: HTML fetched but no @profile URLs extracted.
 * @param {{ html: string, status?: number | null }} meta
 */
export function classifyTikTokHashtagEmpty(meta) {
  const blocked = classifyHttpFetch(meta);
  if (blocked) return blocked;
  const html = String(meta.html || '');
  if (html.length < 500 || !html.includes('tiktok')) {
    return {
      code: RESULT_CODES.PROVIDER_BLOCKED,
      message: 'TikTok hashtag page did not return usable HTML (likely server-side block)',
      retryable: false,
      httpStatus: meta.status ?? null,
    };
  }
  return {
    code: RESULT_CODES.PARSE_ERROR,
    message: 'TikTok hashtag HTML received but no profile URLs could be parsed',
    retryable: false,
    httpStatus: meta.status ?? null,
  };
}

/**
 * @param {string} rawError
 */
export function classifyScrapeFailure(rawError) {
  const msg = String(rawError || 'scrape_failed');
  const lower = msg.toLowerCase();
  if (lower.includes('rate') || lower.includes('429')) {
    return { code: RESULT_CODES.RATE_LIMITED, message: msg, retryable: true };
  }
  if (lower.includes('403') || lower.includes('blocked') || lower.includes('captcha')) {
    return { code: RESULT_CODES.PROVIDER_BLOCKED, message: msg, retryable: false };
  }
  if (lower.includes('timeout') || lower.includes('network') || lower.includes('econn')) {
    return { code: RESULT_CODES.NETWORK_ERROR, message: msg, retryable: true };
  }
  return { code: RESULT_CODES.UPSTREAM_ERROR, message: msg, retryable: true };
}

/**
 * Roll up batch counters + event log into one operator result.
 * @param {{ discovered: number, created: number, skipped: number, failed: number, preBuilt: number }} counters
 * @param {Array<{ code?: string, skipReason?: string, error?: string }>} events
 * @param {{ resolveCode?: string | null }} [opts]
 */
export function classifyBatchOutcome(counters, events = [], opts = {}) {
  const resolveCode = opts.resolveCode || null;
  if (counters.discovered === 0) {
    const fromEvents = events.find((e) => e.code)?.code || resolveCode;
    const code = fromEvents || RESULT_CODES.NO_RESULTS;
    const first = events[0];
    return {
      code,
      message: first?.message || first?.error || `No URLs resolved (${code})`,
      retryable: isRetryableCode(code),
      skipReason: null,
    };
  }

  if (counters.failed > 0 && counters.created === 0 && counters.skipped === 0) {
    const failEvt = events.find((e) => e.code && e.code !== RESULT_CODES.SKIPPED) || events[0];
    const code = failEvt?.code || RESULT_CODES.UPSTREAM_ERROR;
    return {
      code,
      message: failEvt?.message || failEvt?.error || 'All URLs failed',
      retryable: isRetryableCode(code),
      skipReason: null,
    };
  }

  if (counters.failed > 0 && (counters.created > 0 || counters.skipped > 0)) {
    return {
      code: RESULT_CODES.PARTIAL,
      message: `Partial: created ${counters.created}, skipped ${counters.skipped}, failed ${counters.failed}`,
      retryable: true,
      skipReason: null,
    };
  }

  if (counters.created === 0 && counters.skipped > 0) {
    const skip = events.find((e) => e.skipReason)?.skipReason || SKIP_REASONS.ALREADY_EXISTS;
    return {
      code: RESULT_CODES.SKIPPED,
      message: `All candidates skipped (${skip})`,
      retryable: false,
      skipReason: skip,
    };
  }

  if (counters.created > 0 || counters.preBuilt > 0) {
    return {
      code: RESULT_CODES.SUCCESS,
      message: `Created ${counters.created}, pre-built ${counters.preBuilt}`,
      retryable: false,
      skipReason: null,
    };
  }

  return {
    code: RESULT_CODES.NO_RESULTS,
    message: 'No actionable results',
    retryable: false,
    skipReason: null,
  };
}

/**
 * Sanitize event for persistence / API (strip secrets).
 * @param {Record<string, unknown>} event
 */
export function sanitizeDiagnosticEvent(event) {
  const out = { ...event };
  for (const key of Object.keys(out)) {
    const lk = key.toLowerCase();
    if (
      lk.includes('key')
      || lk.includes('token')
      || lk.includes('secret')
      || lk.includes('authorization')
      || lk.includes('password')
    ) {
      delete out[key];
    }
  }
  if (typeof out.message === 'string') out.message = out.message.slice(0, 500);
  if (typeof out.error === 'string') out.error = out.error.slice(0, 500);
  return out;
}
