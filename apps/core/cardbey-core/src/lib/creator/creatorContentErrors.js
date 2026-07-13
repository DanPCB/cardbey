/**
 * Structured creator content transition and validation errors.
 */

/**
 * @param {string} code
 * @param {string} message
 * @param {Record<string, unknown>} [extra]
 */
export function createCreatorContentError(code, message, extra = {}) {
  const err = new Error(message);
  err.code = code;
  Object.assign(err, extra);
  return err;
}

/**
 * @param {string} currentStatus
 * @param {string} requestedStatus
 * @param {string} [message]
 */
export function createCreatorContentTransitionError(
  currentStatus,
  requestedStatus,
  message = 'This content cannot transition to the requested status.',
) {
  return createCreatorContentError('INVALID_CREATOR_CONTENT_TRANSITION', message, {
    currentStatus,
    requestedStatus,
  });
}

/**
 * @param {Error} err
 * @returns {{ code: string, message: string, currentStatus?: string, requestedStatus?: string }}
 */
export function toCreatorContentErrorPayload(err) {
  if (!err || typeof err !== 'object') {
    return { code: 'CREATOR_CONTENT_ERROR', message: String(err) };
  }
  return {
    code: err.code || 'CREATOR_CONTENT_ERROR',
    message: err.message || 'Creator content operation failed.',
    ...(err.currentStatus ? { currentStatus: err.currentStatus } : {}),
    ...(err.requestedStatus ? { requestedStatus: err.requestedStatus } : {}),
  };
}

export default {
  createCreatorContentError,
  createCreatorContentTransitionError,
  toCreatorContentErrorPayload,
};
