/**
 * Lightweight per-process OCR provider health (TTL skip).
 * Avoids re-hitting a quota-exhausted provider within a short window.
 * Not a full circuit-breaker framework.
 */

/** @type {Map<string, { until: number, reason: string }>} */
const exhaustedUntil = new Map();

const DEFAULT_TTL_MS = 5 * 60 * 1000;

/**
 * @param {string} provider
 * @returns {boolean}
 */
export function isOcrProviderTemporarilyUnavailable(provider) {
  const key = String(provider || '').trim();
  if (!key) return false;
  const row = exhaustedUntil.get(key);
  if (!row) return false;
  if (Date.now() >= row.until) {
    exhaustedUntil.delete(key);
    return false;
  }
  return true;
}

/**
 * Mark provider unhealthy for a short TTL (quota / hard provider failure).
 * @param {string} provider
 * @param {string} reason
 * @param {number} [ttlMs]
 */
export function markOcrProviderTemporarilyUnavailable(provider, reason, ttlMs = DEFAULT_TTL_MS) {
  const key = String(provider || '').trim();
  if (!key) return;
  exhaustedUntil.set(key, {
    until: Date.now() + Math.max(1000, Number(ttlMs) || DEFAULT_TTL_MS),
    reason: String(reason || 'provider_error').slice(0, 80),
  });
}

/** Test helper. */
export function resetOcrProviderHealthForTests() {
  exhaustedUntil.clear();
}
