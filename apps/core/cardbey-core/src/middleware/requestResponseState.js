/**
 * Request-scoped response ownership — exactly one layer may commit the HTTP response.
 */

/**
 * @typedef {{
 *   requestId: string;
 *   aborted: boolean;
 *   timedOut: boolean;
 *   responseCommitted: boolean;
 *   abortController: AbortController;
 *   requestDeadline: number;
 * }} RequestResponseState
 */

/** @type {Set<string>} */
const activeRequestIds = new Set();

/**
 * @param {import('express').Request} req
 * @returns {RequestResponseState}
 */
export function getRequestResponseState(req) {
  if (!req.__responseState) {
    const requestId = String(req.requestId ?? '').trim() || 'unknown';
    const timeoutMs = Number(req.__latencyTimeoutMs) > 0 ? Number(req.__latencyTimeoutMs) : 10_000;
    req.__responseState = {
      requestId,
      aborted: false,
      timedOut: false,
      responseCommitted: false,
      abortController: new AbortController(),
      requestDeadline: Date.now() + timeoutMs,
    };
    activeRequestIds.add(requestId);
  }
  return req.__responseState;
}

/**
 * @param {import('express').Request} req
 */
export function attachRequestResponseState(req) {
  const state = getRequestResponseState(req);
  req.abortSignal = state.abortController.signal;
  req.requestDeadline = state.requestDeadline;
  req.isTimedOut = () => state.timedOut || state.aborted;
  req.isRequestAborted = () => state.aborted || state.timedOut;
}

/**
 * @param {import('express').Request} req
 */
export function markRequestTimedOut(req) {
  const state = getRequestResponseState(req);
  if (state.timedOut) return;
  state.timedOut = true;
  state.aborted = true;
  try {
    state.abortController.abort(new Error('request_timeout'));
  } catch {
    /* ignore */
  }
}

/**
 * @param {import('express').Request} req
 * @param {string} [reason]
 */
export function markRequestAborted(req, reason = 'aborted') {
  const state = getRequestResponseState(req);
  if (state.aborted) return;
  state.aborted = true;
  try {
    state.abortController.abort(new Error(reason));
  } catch {
    /* ignore */
  }
}

/**
 * @param {import('express').Request} req
 */
export function clearRequestResponseState(req) {
  const state = req.__responseState;
  if (state?.requestId) activeRequestIds.delete(state.requestId);
  delete req.__responseState;
}

/**
 * @param {import('express').Response} res
 * @param {import('express').Request} [req]
 * @returns {boolean}
 */
export function canSendResponse(res, req) {
  if (res.headersSent || res.writableEnded) return false;
  if (req) {
    const state = req.__responseState;
    if (state?.responseCommitted) return false;
  }
  return true;
}

/**
 * @param {import('express').Response} res
 * @param {number} status
 * @param {unknown} body
 * @param {import('express').Request} [req]
 * @returns {boolean}
 */
export function safeJson(res, status, body, req) {
  if (!canSendResponse(res, req)) {
    if (req?.__responseState?.timedOut || req?.__responseState?.aborted) {
      logLateCompletion(req, 'response_blocked_after_abort');
    }
    return false;
  }
  const state = req ? getRequestResponseState(req) : null;
  if (state) state.responseCommitted = true;
  res.status(status).json(body);
  return true;
}

/**
 * @param {import('express').Request} req
 * @param {string} phase
 * @param {Record<string, unknown>} [extra]
 */
export function logLateCompletion(req, phase, extra = {}) {
  const state = req?.__responseState;
  console.warn(
    JSON.stringify({
      evt: 'request_completed_after_abort',
      phase,
      requestId: state?.requestId ?? req?.requestId ?? null,
      timedOut: state?.timedOut ?? false,
      aborted: state?.aborted ?? false,
      responseCommitted: state?.responseCommitted ?? false,
      ...extra,
    }),
  );
}

/**
 * @param {import('express').Request} req
 * @param {string} label
 * @returns {boolean}
 */
export function throwIfRequestAborted(req, label = 'operation') {
  if (!req?.isRequestAborted?.()) return false;
  const err = new Error(`request_aborted:${label}`);
  err.code = 'REQUEST_ABORTED';
  throw err;
}

/**
 * Bounded runtime diagnostics snapshot.
 */
export function getRequestResponseDiagnostics() {
  const mem = process.memoryUsage();
  return {
    heapUsed: mem.heapUsed,
    rss: mem.rss,
    external: mem.external,
    arrayBuffers: mem.arrayBuffers,
    activeRequests: activeRequestIds.size,
  };
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function requestResponseStateMiddleware(req, res, next) {
  attachRequestResponseState(req);
  const onDone = () => clearRequestResponseState(req);
  res.on('finish', onDone);
  res.on('close', onDone);
  next();
}
