/**
 * Rate Limiting Middleware (P6).
 */

import rateLimiter from './rateLimiter.js';

/**
 * @param {{ endpoint: string; windowMs?: number; maxRequests?: number; perUser?: boolean }} config
 */
export function rateLimitMiddleware(config) {
  const { endpoint, windowMs = 60_000, maxRequests = 100, perUser = true } = config;

  rateLimiter.configure({ endpoint, windowMs, maxRequests, perUser });

  return (req, res, next) => {
    const userId = req.user?.id || req.ip || 'anonymous';
    const result = rateLimiter.check(endpoint, userId);

    res.setHeader('X-RateLimit-Limit', String(result.limit ?? maxRequests));

    if (!result.allowed) {
      res.setHeader('X-RateLimit-Remaining', '0');
      return res.status(429).json({
        ok: false,
        error: 'rate_limit_exceeded',
        message: 'Too many requests. Please try again later.',
        limit: result.limit,
        resetIn: Math.ceil((result.resetIn ?? windowMs) / 1000),
      });
    }

    res.setHeader('X-RateLimit-Remaining', String(result.remaining ?? 0));
    next();
  };
}
