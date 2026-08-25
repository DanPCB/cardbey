/**
 * Retry wrapper for Claude / LLM calls only (Phase 5).
 * Do not use for Prisma, filesystem, or internal service calls.
 */

const RETRY_DELAYS_MS = [2000, 5000, 15000, 30000];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {unknown} err
 * @returns {boolean}
 */
export function isRateLimitError(err) {
  if (!err || typeof err !== 'object') return false;
  const e = /** @type {Record<string, unknown>} */ (err);
  if (e.status === 429 || e.statusCode === 429) return true;
  const msg = String(e.message ?? e.error ?? '');
  return /rate[_\s-]?limit|too many requests|429/i.test(msg);
}

/**
 * @template T
 * @param {() => Promise<T>} fn
 * @param {{
 *   maxAttempts?: number,
 *   agentName?: string,
 *   missionId?: string | null,
 *   sseEmitter?: { emit?: (event: string, payload: unknown) => void } | null,
 *   delaysMs?: number[],
 * }} [options]
 * @returns {Promise<T>}
 */
export async function withAgentRetry(fn, options = {}) {
  const {
    maxAttempts = 4,
    agentName = 'unknown',
    missionId = null,
    sseEmitter = null,
    delaysMs = RETRY_DELAYS_MS,
  } = options;

  let lastError;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isRateLimitError(err)) throw err;

      const delay = delaysMs[attempt] ?? delaysMs[delaysMs.length - 1] ?? 60000;
      console.warn(
        `[${agentName}] Rate limited on attempt ${attempt + 1}. ` +
          `Retrying in ${delay}ms... (missionId: ${missionId})`,
      );
      sseEmitter?.emit?.('agent_status', {
        agentName,
        status: 'rate_limited',
        retryIn: delay,
        attempt: attempt + 1,
        maxAttempts,
        missionId,
      });
      if (attempt >= maxAttempts - 1) break;
      await sleep(delay);
    }
  }

  throw new Error(
    `[${agentName}] All ${maxAttempts} attempts failed. Last error: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}
