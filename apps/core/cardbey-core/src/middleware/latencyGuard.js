/**
 * API latency SLO guard — logs breaches, records metrics, and enforces request timeouts.
 */

import circuitBreaker from '../services/reliability/circuitBreaker.js';
import metricsCollector from '../services/reliability/metricsCollector.js';

function sloWarnMs() {
  return parseInt(process.env.API_LATENCY_SLO_MS, 10) || 5_000;
}

function sloCriticalMs() {
  return parseInt(process.env.API_LATENCY_CRITICAL_MS, 10) || 10_000;
}

function requestTimeoutMs() {
  return parseInt(process.env.API_REQUEST_TIMEOUT_MS, 10) || 10_000;
}

function longRunningTimeoutMs() {
  return parseInt(process.env.API_LONG_RUNNING_TIMEOUT_MS, 10) || 120_000;
}

const STREAM_PATH_PREFIXES = [
  '/api/stream',
  '/api/ai/stream',
  '/api/admin/platform/activity/stream',
  '/api/public/store-engagement/stream',
];

const LONG_RUNNING_PREFIXES = [
  '/api/mi/orchestra',
  '/api/performer/intake',
  '/api/performer/runtime',
  '/api/skills/execute',
  '/api/agents/execute',
  '/api/upload',
  '/api/chat/threads',
];

function requestPath(req) {
  return String(req.originalUrl || req.url || '').split('?')[0];
}

export function isLatencyGuardExempt(req) {
  const path = requestPath(req);
  if (req.method === 'OPTIONS') return true;
  if (path.startsWith('/uploads')) return true;
  if (STREAM_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))) return true;
  if (/\/activity\/stream$/.test(path)) return true;
  if (path === '/api/health' || path === '/api/healthz' || path === '/api/readyz') return true;
  if (path === '/healthz' || path === '/readyz') return true;
  if (String(req.headers.accept || '').includes('text/event-stream')) return true;
  return false;
}

function resolveTimeoutMs(req) {
  const path = requestPath(req);
  if (LONG_RUNNING_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return longRunningTimeoutMs();
  }
  return requestTimeoutMs();
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function latencyGuard(req, res, next) {
  if (isLatencyGuardExempt(req)) {
    return next();
  }

  const start = Date.now();
  const path = requestPath(req);
  const timeoutMs = resolveTimeoutMs(req);
  let finished = false;

  const onFinish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timeout);

    const duration = Date.now() - start;
    const longRunning = LONG_RUNNING_PREFIXES.some((prefix) => path.startsWith(prefix));
    metricsCollector.recordMetric('api.latency', duration, {
      path,
      method: String(req.method || 'GET'),
      status: String(res.statusCode || 0),
      sloEligible: longRunning ? 'false' : 'true',
    });

    if (duration > sloWarnMs()) {
      console.warn(`[LatencyGuard] SLO breach: ${duration}ms for ${req.method} ${path}`);
    }

    if (duration > sloCriticalMs()) {
      circuitBreaker.open('api_latency', `SLO critical breach: ${duration}ms for ${req.method} ${path}`);
    }
  };

  res.on('finish', onFinish);
  res.on('close', onFinish);

  const timeout = setTimeout(() => {
    if (finished || res.headersSent) return;
    finished = true;
    console.warn(`[LatencyGuard] Request timeout after ${timeoutMs}ms for ${req.method} ${path}`);
    circuitBreaker.open('api_latency', `Request timeout: ${req.method} ${path}`);
    if (!res.headersSent) {
      res.status(408).json({
        ok: false,
        error: 'request_timeout',
        message: 'Request took too long to process',
        timeoutMs,
      });
    }
  }, timeoutMs);

  if (typeof timeout.unref === 'function') {
    timeout.unref();
  }

  next();
}
