/**
 * Simple rate limiting middleware
 * In-memory store (resets on server restart)
 */

const rateLimitStore = new Map();

/**
 * Create a rate limiter middleware
 * @param {Object} options
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.max - Maximum requests per window
 * @param {Function} options.keyGenerator - Function to generate key from request (default: uses IP)
 * @param {string} [options.message] - Optional custom 429 message (can use {retryAfter}, {max}, {windowMinutes})
 * @param {string} [options.code] - Optional machine-readable code in 429 body (default 'rate_limit_exceeded')
 * @returns {Function} Express middleware
 */
export function rateLimit({ windowMs, max, keyGenerator = (req) => req.ip || 'unknown', message: customMessage, code: responseCode = 'rate_limit_exceeded' }) {
  return (req, res, next) => {
    const key = keyGenerator(req);
    const now = Date.now();
    const record = rateLimitStore.get(key) || { count: 0, resetAt: now + windowMs };

    // Reset if window expired
    if (now > record.resetAt) {
      record.count = 0;
      record.resetAt = now + windowMs;
    }

    // Check limit
    if (record.count >= max) {
      const retryAfter = Math.ceil((record.resetAt - now) / 1000);
      const windowMinutes = Math.ceil(windowMs / 60000);
      res.setHeader('Retry-After', retryAfter);
      console.warn(`[RateLimit] Rate limit exceeded for ${key} on ${req.method} ${req.path} - ${record.count}/${max} requests`);
      const message = typeof customMessage === 'string'
        ? customMessage.replace(/{retryAfter}/g, String(retryAfter)).replace(/{max}/g, String(max)).replace(/{windowMinutes}/g, String(windowMinutes))
        : `Rate limit exceeded. Maximum ${max} requests per ${Math.ceil(windowMs / 1000)} seconds. Please wait ${retryAfter} seconds.`;
      return res.status(429).json({
        ok: false,
        code: responseCode,
        error: 'rate_limit_exceeded',
        message,
        retryAfter,
        limit: max,
        windowSeconds: Math.ceil(windowMs / 1000),
      });
    }

    // Increment and store
    record.count++;
    rateLimitStore.set(key, record);

    // Add headers
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - record.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetAt / 1000));

    next();
  };
}

/**
 * Clean up old rate limit records (call periodically)
 */
export function cleanupRateLimitStore() {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    if (now > record.resetAt + 60000) { // Keep for 1 minute after expiry
      rateLimitStore.delete(key);
    }
  }
}

