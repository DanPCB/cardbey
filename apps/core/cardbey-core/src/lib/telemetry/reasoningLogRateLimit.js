/**
 * Lightweight in-memory rate limit for GET /reasoning-log (read-only path protection).
 */

const WINDOW_MS = 1_000;
const MAX_PER_WINDOW = 4;

/** @type {Map<string, { windowStart: number, count: number }>} */
const buckets = new Map();

/**
 * @param {string} missionId
 * @returns {{ allowed: boolean, retryAfterMs?: number }}
 */
export function checkReasoningLogReadRate(missionId) {
  const id = typeof missionId === 'string' ? missionId.trim() : '';
  if (!id) return { allowed: false };

  const now = Date.now();
  let bucket = buckets.get(id);
  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    bucket = { windowStart: now, count: 0 };
    buckets.set(id, bucket);
  }
  bucket.count += 1;
  if (bucket.count > MAX_PER_WINDOW) {
    const retryAfterMs = Math.max(0, WINDOW_MS - (now - bucket.windowStart));
    return { allowed: false, retryAfterMs };
  }
  return { allowed: true };
}

/** @internal */
export function resetReasoningLogRateLimitForTests() {
  buckets.clear();
}
