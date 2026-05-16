/**
 * Ingestion guardrails: rate limiting, retry with exponential backoff, reject/banlist, metrics.
 * Used by scripts/seed-ingest.js only; does not affect Draft Review / Public Preview.
 */

/**
 * Run fn with exponential backoff. On failure waits baseMs, then 2x, then 4x, etc.
 * @param {() => Promise<T>} fn
 * @param {{ maxRetries?: number; baseMs?: number }} opts
 * @returns {Promise<T>}
 */
export async function withRetry(fn, opts = {}) {
  const maxRetries = Math.max(0, parseInt(process.env.SEED_INGEST_MAX_RETRIES, 10) || 3);
  const baseMs = Math.max(100, parseInt(process.env.SEED_INGEST_BACKOFF_BASE_MS, 10) || 1000);
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === maxRetries) break;
      const delay = baseMs * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/**
 * Delay between provider API calls (rate limit). Reads SEED_INGEST_RATE_LIMIT_PER_MINUTE (default 30).
 */
export function getRateLimitDelayMs() {
  const perMinute = Math.max(1, parseInt(process.env.SEED_INGEST_RATE_LIMIT_PER_MINUTE, 10) || 30);
  return Math.ceil(60000 / perMinute);
}

/**
 * Wait for rate limit (call after each searchPhotos / page fetch).
 */
export function rateLimitDelay() {
  return new Promise((r) => setTimeout(r, getRateLimitDelayMs()));
}

/**
 * Build set of sha256 hashes to reject (banlist). Env: SEED_REJECT_SHA256 comma-separated.
 */
export function getRejectSha256Set() {
  const raw = process.env.SEED_REJECT_SHA256;
  if (!raw || typeof raw !== 'string') return new Set();
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

/**
 * Build set of "provider:providerAssetId" to reject. Env: SEED_REJECT_PROVIDER_IDS comma-separated (e.g. "pexels:123" or "123" for current provider).
 */
export function getRejectProviderIdsSet(provider) {
  const raw = process.env.SEED_REJECT_PROVIDER_IDS;
  if (!raw || typeof raw !== 'string') return new Set();
  const set = new Set();
  for (const part of raw.split(',')) {
    const t = part.trim();
    if (!t) continue;
    if (t.includes(':')) set.add(t.toLowerCase());
    else if (provider) set.add(`${provider}:${t}`);
  }
  return set;
}
