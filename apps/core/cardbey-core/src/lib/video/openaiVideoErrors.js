/**
 * Typed errors for OpenAI video provider → artifact lifecycle mapping.
 */

export class OpenAiVideoUnavailableError extends Error {
  /**
   * @param {string} message
   * @param {{ status?: number; code?: string }} [meta]
   */
  constructor(message, meta = {}) {
    super(message);
    this.name = 'OpenAiVideoUnavailableError';
    this.status = meta.status;
    this.code = meta.code ?? 'OPENAI_VIDEO_UNAVAILABLE';
  }
}

export class OpenAiVideoFailedError extends Error {
  /**
   * @param {string} message
   * @param {{ retryable?: boolean; providerJobId?: string }} [meta]
   */
  constructor(message, meta = {}) {
    super(message);
    this.name = 'OpenAiVideoFailedError';
    this.retryable = meta.retryable !== false;
    this.providerJobId = meta.providerJobId;
    this.code = 'OPENAI_VIDEO_FAILED';
  }
}

/**
 * @param {unknown} err
 * @param {number} [httpStatus]
 */
export function classifyOpenAiHttpError(err, httpStatus) {
  const status = httpStatus ?? (typeof err === 'object' && err && 'status' in err ? Number(err.status) : 0);
  const message = err instanceof Error ? err.message : String(err ?? 'OpenAI video request failed');

  if (status === 401 || status === 403) {
    return new OpenAiVideoUnavailableError(
      'OpenAI video access is not authorized. Check OPENAI_API_KEY and account video access.',
      { status, code: 'OPENAI_VIDEO_UNAUTHORIZED' },
    );
  }

  if (status === 404) {
    return new OpenAiVideoUnavailableError(
      'OpenAI video model or endpoint is not available for this API key.',
      { status, code: 'OPENAI_VIDEO_NOT_FOUND' },
    );
  }

  if (status === 429) {
    return new OpenAiVideoFailedError('OpenAI video rate limit reached. Try again in a few minutes.', {
      retryable: true,
    });
  }

  const lower = message.toLowerCase();
  if (
    lower.includes('model') &&
    (lower.includes('not found') || lower.includes('does not exist') || lower.includes('unavailable'))
  ) {
    return new OpenAiVideoUnavailableError(
      'The configured OpenAI video model is not available for your account.',
      { status, code: 'OPENAI_VIDEO_MODEL_UNAVAILABLE' },
    );
  }

  if (status >= 500) {
    return new OpenAiVideoFailedError('OpenAI video service error. Please try again.', { retryable: true });
  }

  return new OpenAiVideoFailedError(message, { retryable: status >= 400 && status < 500 ? false : true });
}
