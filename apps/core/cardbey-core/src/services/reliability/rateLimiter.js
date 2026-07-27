/**
 * Rate Limiter — per-user and per-endpoint rate limiting (P6).
 */

export class RateLimiter {
  constructor() {
    /** @type {Map<string, { windowMs: number; maxRequests: number; perUser: boolean }>} */
    this.limits = new Map();
    /** @type {Map<string, { timestamps: number[] }>} */
    this.records = new Map();
    this.defaults = {
      windowMs: 60_000,
      maxRequests: 100,
      perUser: true,
    };
  }

  /**
   * @param {{ endpoint: string; windowMs?: number; maxRequests?: number; perUser?: boolean }} config
   */
  configure(config) {
    const { endpoint, windowMs = 60_000, maxRequests = 100, perUser = true } = config;
    this.limits.set(endpoint, { windowMs, maxRequests, perUser });
    console.log(`[RateLimiter] Configured ${endpoint}: ${maxRequests} per ${windowMs}ms`);
  }

  /**
   * @param {string} endpoint
   * @param {string|null} [userId]
   */
  check(endpoint, userId = null) {
    const config = this.limits.get(endpoint) || this.defaults;
    const key = this.getKey(endpoint, userId, config.perUser);

    const now = Date.now();
    const windowStart = now - config.windowMs;

    let record = this.records.get(key);
    if (!record) {
      record = { timestamps: [] };
      this.records.set(key, record);
    }

    record.timestamps = record.timestamps.filter((t) => t > windowStart);

    if (record.timestamps.length >= config.maxRequests) {
      return {
        allowed: false,
        limit: config.maxRequests,
        remaining: 0,
        resetIn: config.windowMs,
      };
    }

    record.timestamps.push(now);
    return {
      allowed: true,
      limit: config.maxRequests,
      remaining: config.maxRequests - record.timestamps.length,
      resetIn: config.windowMs,
    };
  }

  getKey(endpoint, userId, perUser) {
    const base = `rate:${endpoint}`;
    return perUser && userId ? `${base}:user:${userId}` : base;
  }

  getConfiguredEndpoints() {
    return [...this.limits.entries()].map(([endpoint, config]) => ({
      endpoint,
      ...config,
    }));
  }

  getLimits() {
    return this.getConfiguredEndpoints();
  }

  resetForTests() {
    this.records.clear();
    this.limits.clear();
  }
}

const rateLimiter = new RateLimiter();
export default rateLimiter;
