/**
 * Rate Limit Configuration (P6).
 */

import rateLimiter from './rateLimiter.js';

rateLimiter.configure({
  endpoint: '/api/performer/intake',
  windowMs: 60_000,
  maxRequests: 30,
  perUser: true,
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
