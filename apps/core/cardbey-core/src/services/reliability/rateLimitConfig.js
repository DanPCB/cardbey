/**
 * Rate Limit Configuration (P6).
 */

import rateLimiter from './rateLimiter.js';

rateLimiter.configure({
  /** Deprecated shim — still rate-limited for external callers during grace period. */
  endpoint: '/api/performer/intake',
  windowMs: 60_000,
  maxRequests: 30,
  perUser: true,
});

rateLimiter.configure({
  endpoint: '/api/performer/intake/v2',
  windowMs: 60_000,
  maxRequests: 30,
  perUser: true,
});

rateLimiter.configure({
  endpoint: '/api/layout/apply',
  windowMs: 60_000,
  maxRequests: 30,
  perUser: false,
});

rateLimiter.configure({
  endpoint: '/api/agents/auto-layout',
  windowMs: 60_000,
  maxRequests: 30,
  perUser: false,
});

rateLimiter.configure({
  endpoint: '/api/agents/execute',
  windowMs: 60_000,
  maxRequests: 20,
  perUser: true,
});

rateLimiter.configure({
  endpoint: '/api/memory/bundle',
  windowMs: 60_000,
  maxRequests: 50,
  perUser: true,
});

rateLimiter.configure({
  endpoint: '/api/skills/execute',
  windowMs: 60_000,
  maxRequests: 30,
  perUser: true,
});

rateLimiter.configure({
  endpoint: '/api/public',
  windowMs: 60_000,
  maxRequests: 10,
  perUser: false,
});

rateLimiter.configure({
  endpoint: '/api/location/geocode',
  windowMs: 60_000,
  maxRequests: 30,
  perUser: false,
});

rateLimiter.configure({
  endpoint: '/api/location/reverse-geocode',
  windowMs: 60_000,
  maxRequests: 30,
  perUser: false,
});

rateLimiter.configure({
  endpoint: '/api/executive/growth',
  windowMs: 60_000,
  maxRequests: 40,
  perUser: true,
});

rateLimiter.configure({
  endpoint: '/api/runtime/diagnostics',
  windowMs: 60_000,
  maxRequests: 100,
  perUser: true,
});

rateLimiter.configure({
  endpoint: '/api/diagnostics',
  windowMs: 60_000,
  maxRequests: 50,
  perUser: false,
});
