/**
 * OCR / vision provider failure classification.
 * Distinguishes infrastructure failure from unreadable images from empty OCR.
 */

/** @typedef {'SUCCESS'|'UNREADABLE'|'REFUSED'|'QUOTA_EXHAUSTED'|'RATE_LIMITED'|'TIMEOUT'|'NETWORK_ERROR'|'PROVIDER_ERROR'|'NOT_CONFIGURED'|'EMPTY_RESULT'|'VISION_PROVIDERS_UNAVAILABLE'} OcrResultClass */

export const OCR_RESULT_CLASS = Object.freeze({
  SUCCESS: 'SUCCESS',
  UNREADABLE: 'UNREADABLE',
  REFUSED: 'REFUSED',
  QUOTA_EXHAUSTED: 'QUOTA_EXHAUSTED',
  RATE_LIMITED: 'RATE_LIMITED',
  TIMEOUT: 'TIMEOUT',
  NETWORK_ERROR: 'NETWORK_ERROR',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  EMPTY_RESULT: 'EMPTY_RESULT',
  VISION_PROVIDERS_UNAVAILABLE: 'VISION_PROVIDERS_UNAVAILABLE',
});

/**
 * Recoverable provider failures — try the next configured provider.
 * @param {string} classification
 */
export function isRecoverableProviderFailure(classification) {
  return (
    classification === OCR_RESULT_CLASS.QUOTA_EXHAUSTED ||
    classification === OCR_RESULT_CLASS.RATE_LIMITED ||
    classification === OCR_RESULT_CLASS.TIMEOUT ||
    classification === OCR_RESULT_CLASS.NETWORK_ERROR ||
    classification === OCR_RESULT_CLASS.PROVIDER_ERROR ||
    classification === OCR_RESULT_CLASS.EMPTY_RESULT ||
    classification === OCR_RESULT_CLASS.REFUSED ||
    classification === OCR_RESULT_CLASS.NOT_CONFIGURED
  );
}

/**
 * Classify a thrown provider error (do not log secrets).
 * @param {unknown} err
 * @returns {string}
 */
export function classifyOcrProviderError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  const status = Number(err?.status || err?.statusCode || err?.response?.status || 0);
  const code = String(err?.code || err?.error?.code || '').toLowerCase();
  const type = String(err?.type || err?.error?.type || '').toLowerCase();
  const blob = `${msg} ${code} ${type}`;

  if (
    blob.includes('insufficient_quota') ||
    blob.includes('credit_balance_exhausted') ||
    blob.includes('billing') ||
    blob.includes('quota') ||
    blob.includes('exceeded your current quota')
  ) {
    return OCR_RESULT_CLASS.QUOTA_EXHAUSTED;
  }
  if (status === 429 || blob.includes('rate limit') || blob.includes('rate_limit') || code === 'rate_limit_exceeded') {
    return OCR_RESULT_CLASS.RATE_LIMITED;
  }
  if (
    blob.includes('timeout') ||
    blob.includes('timed out') ||
    blob.includes('aborted') ||
    code === 'etimedout' ||
    code === 'abort_err'
  ) {
    return OCR_RESULT_CLASS.TIMEOUT;
  }
  if (
    blob.includes('network') ||
    blob.includes('econnreset') ||
    blob.includes('econnrefused') ||
    blob.includes('fetch failed') ||
    code === 'enotfound'
  ) {
    return OCR_RESULT_CLASS.NETWORK_ERROR;
  }
  if (
    blob.includes('not configured') ||
    blob.includes('api key') ||
    blob.includes('not set') ||
    classificationLooksNotConfigured(blob)
  ) {
    return OCR_RESULT_CLASS.NOT_CONFIGURED;
  }
  if (status >= 500 || blob.includes('provider error') || blob.includes('internal server')) {
    return OCR_RESULT_CLASS.PROVIDER_ERROR;
  }
  if (status >= 400 || blob.includes('failed') || blob.includes('error')) {
    return OCR_RESULT_CLASS.PROVIDER_ERROR;
  }
  return OCR_RESULT_CLASS.PROVIDER_ERROR;
}

function classificationLooksNotConfigured(blob) {
  return (
    blob.includes('openai api key not configured') ||
    blob.includes('anthropic') && blob.includes('disabled') ||
    blob.includes('google_cloud_vision_api_key is not set')
  );
}

/**
 * Classify a non-throwing OCR text payload.
 * @param {string} text
 * @param {{ isRefusal?: (t: string) => boolean }} [opts]
 */
export function classifyOcrTextResult(text, opts = {}) {
  const t = typeof text === 'string' ? text.trim() : '';
  if (!t) return OCR_RESULT_CLASS.EMPTY_RESULT;
  if (typeof opts.isRefusal === 'function' && opts.isRefusal(t)) {
    return OCR_RESULT_CLASS.REFUSED;
  }
  return OCR_RESULT_CLASS.SUCCESS;
}
