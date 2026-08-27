/**
 * MiniMax H3 provider-neutral errors. Never include the API key.
 */

export class MiniMaxProviderError extends Error {
  /**
   * @param {object} opts
   * @param {string} opts.code
   * @param {string} opts.message
   * @param {string} [opts.userMessage]
   * @param {string} [opts.providerCode]
   * @param {number} [opts.httpStatus]
   * @param {string} [opts.providerRequestId]
   * @param {string} [opts.status]
   */
  constructor(opts) {
    super(opts.message);
    this.name = 'MiniMaxProviderError';
    this.code = opts.code;
    this.userMessage = opts.userMessage || opts.message;
    this.providerCode = opts.providerCode || null;
    this.httpStatus = opts.httpStatus ?? null;
    this.providerRequestId = opts.providerRequestId || null;
    this.status = opts.status || 'FAILED';
  }

  toPublic() {
    return {
      code: this.code,
      message: this.userMessage,
      providerCode: this.providerCode,
      status: this.status,
    };
  }
}

const USER_MESSAGES = {
  MINIMAX_API_KEY_MISSING: 'MiniMax video is not connected yet.',
  MINIMAX_API_KEY_INVALID: 'MiniMax could not verify the server credentials.',
  MINIMAX_INSUFFICIENT_BALANCE: 'MiniMax does not have enough credit to generate this video.',
  MINIMAX_RATE_LIMIT: 'MiniMax is busy. Please wait and try once — we will not start a second paid job.',
  MINIMAX_SENSITIVE_CONTENT: 'The video brief was rejected for sensitive content. Try a different description.',
  MINIMAX_INVALID_PARAMS: 'The video settings are not valid for MiniMax H3.',
  MINIMAX_TIMEOUT: 'MiniMax did not finish in time. No extra paid generation was started.',
  MINIMAX_FAILED: 'MiniMax could not generate this video.',
  MINIMAX_CANCELLED: 'The MiniMax video job was cancelled.',
  MINIMAX_MISSING_OUTPUT_URL: 'MiniMax finished but did not return a video file.',
  MINIMAX_OUTPUT_EXPIRED: 'The MiniMax download link expired before Cardbey could store the video.',
  MINIMAX_DOWNLOAD_FAILED: 'Cardbey could not retrieve the generated video from MiniMax.',
  MINIMAX_INVALID_MEDIA: 'The MiniMax download was not a valid video file.',
  MINIMAX_PROVIDER_ERROR: 'MiniMax had a temporary error. The job was not resubmitted.',
};

function pickUserMessage(code, fallback) {
  return USER_MESSAGES[code] || fallback || USER_MESSAGES.MINIMAX_FAILED;
}

/**
 * Map MiniMax HTTP / OpenAI-style error body to Cardbey codes.
 * @param {{ status?: number, body?: object, providerRequestId?: string }} input
 */
export function mapMinimaxHttpError(input = {}) {
  const status = Number(input.status) || 0;
  const body = input.body && typeof input.body === 'object' ? input.body : {};
  const detail = body.error && typeof body.error === 'object' ? body.error : {};
  const type = String(detail.type || body.type || '').toLowerCase();
  const message = String(detail.message || body.message || '').trim();
  const providerCodeMatch = message.match(/\((\d{3,5})\)\s*$/);
  const providerCode =
    String(detail.http_code || body.error?.code || providerCodeMatch?.[1] || status || '').trim() ||
    null;
  const providerRequestId = String(input.providerRequestId || body.request_id || '').trim() || null;

  let code = 'MINIMAX_PROVIDER_ERROR';
  if (status === 401 || type === 'authorized_error') code = 'MINIMAX_API_KEY_INVALID';
  else if (status === 402 || type === 'insufficient_balance_error') code = 'MINIMAX_INSUFFICIENT_BALANCE';
  else if (status === 422 || type === 'unprocessable_entity_error') code = 'MINIMAX_SENSITIVE_CONTENT';
  else if (status === 429 || type === 'rate_limit_error') code = 'MINIMAX_RATE_LIMIT';
  else if (status === 400 || type === 'bad_request_error') code = 'MINIMAX_INVALID_PARAMS';

  return new MiniMaxProviderError({
    code,
    message: message || `MiniMax HTTP ${status}`,
    userMessage: pickUserMessage(code, message),
    providerCode,
    httpStatus: status || null,
    providerRequestId,
    status: 'FAILED',
  });
}

/**
 * Map MiniMax task.error after a failed generation.
 * @param {{ code?: string, message?: string }} error
 * @param {string} [taskStatus]
 */
export function mapMinimaxTaskError(error = {}, taskStatus = 'failed') {
  const providerCode = String(error.code || '').trim() || null;
  const message = String(error.message || '').trim() || 'MiniMax generation failed';
  const lower = message.toLowerCase();
  let code = 'MINIMAX_FAILED';
  if (taskStatus === 'cancelled') code = 'MINIMAX_CANCELLED';
  else if (lower.includes('sensitive')) code = 'MINIMAX_SENSITIVE_CONTENT';
  else if (lower.includes('balance')) code = 'MINIMAX_INSUFFICIENT_BALANCE';
  else if (providerCode === '1026') code = 'MINIMAX_SENSITIVE_CONTENT';

  return new MiniMaxProviderError({
    code,
    message,
    userMessage: pickUserMessage(code, message),
    providerCode,
    status: taskStatus === 'cancelled' ? 'CANCELLED' : 'FAILED',
  });
}

export { USER_MESSAGES as MINIMAX_USER_MESSAGES };
