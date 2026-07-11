/**
 * In-memory per-mission rate limit for POST /agent-messages/stream-token.
 */

const STREAM_TOKEN_WINDOW_MS = 15_000;
const STREAM_TOKEN_MAX_PER_MISSION = 5;
const BUCKET_TTL_MS = 5 * 60_000;

/** @type {Map<string, { count: number, resetAt: number, lastSeen: number }>} */
const streamTokenBuckets = new Map();

/**
 * @param {string} missionId
 * @returns {boolean} true when allowed
 */
export function checkStreamTokenRateLimit(missionId) {
  const key = String(missionId ?? '').trim();
  if (!key) return false;

  const now = Date.now();
  const bucket = streamTokenBuckets.get(key) ?? {
    count: 0,
    resetAt: now + STREAM_TOKEN_WINDOW_MS,
    lastSeen: now,
  };

  if (now >= bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + STREAM_TOKEN_WINDOW_MS;
  }

  bucket.count += 1;
  bucket.lastSeen = now;
  streamTokenBuckets.set(key, bucket);

  return bucket.count <= STREAM_TOKEN_MAX_PER_MISSION;
}

/** Drop stale mission buckets to avoid unbounded Map growth. */
export function cleanupStreamTokenRateLimitBuckets(maxAgeMs = BUCKET_TTL_MS) {
  const now = Date.now();
  let removed = 0;
  for (const [key, bucket] of streamTokenBuckets.entries()) {
    if (now - bucket.lastSeen > maxAgeMs) {
      streamTokenBuckets.delete(key);
      removed += 1;
    }
  }
  return removed;
}

/** @internal tests */
export function resetStreamTokenRateLimitForTests() {
  streamTokenBuckets.clear();
}

export function getStreamTokenRateLimitConfig() {
  return {
    windowMs: STREAM_TOKEN_WINDOW_MS,
    maxPerMission: STREAM_TOKEN_MAX_PER_MISSION,
  };
}
