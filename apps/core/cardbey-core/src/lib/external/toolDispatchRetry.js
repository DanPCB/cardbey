/**
 * Opt-in retry wrapper for toolDispatcher — transient failures only.
 * Enable per tool via TOOL_DISPATCH_RETRY_TOOLS (comma-separated tool names).
 */

/** @type {Set<string> | null} */
let retryableToolsCache = null;

/**
 * @returns {Set<string>}
 */
export function getRetryableToolNames() {
  if (retryableToolsCache) return retryableToolsCache;
  const raw = String(process.env.TOOL_DISPATCH_RETRY_TOOLS ?? '').trim();
  retryableToolsCache = new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  return retryableToolsCache;
}

/**
 * @param {string} toolName
 * @returns {boolean}
 */
export function isToolRetryEnabled(toolName) {
  return getRetryableToolNames().has(String(toolName ?? '').trim());
}

/**
 * @returns {number}
 */
export function getToolRetryMaxAttempts() {
  const n = Number(process.env.TOOL_DISPATCH_RETRY_MAX ?? 2);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 2;
}

/**
 * @returns {number}
 */
export function getToolRetryDelayMs() {
  const n = Number(process.env.TOOL_DISPATCH_RETRY_DELAY_MS ?? 500);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 500;
}

/** @param {number} ms */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const TRANSIENT_ERROR_CODES = new Set([
  'NETWORK_ERROR',
  'TIMEOUT',
  'RATE_LIMIT',
  'RATE_LIMITED',
  'SERVICE_UNAVAILABLE',
  'PROVIDER_UNAVAILABLE',
  'ECONNRESET',
  'ETIMEDOUT',
]);

/**
 * @param {{ status?: string; error?: { code?: string }; blocker?: { code?: string } }} result
 * @returns {boolean}
 */
export function isTransientDispatchFailure(result) {
  if (!result || result.status === 'ok' || result.status === 'blocked') return false;
  const code = String(result.error?.code ?? result.blocker?.code ?? '').trim().toUpperCase();
  if (!code) return false;
  return TRANSIENT_ERROR_CODES.has(code);
}

/**
 * Run executor with optional retries (opt-in per tool, env-gated).
 * Retries thrown exceptions and transient failed results.
 *
 * @template T
 * @param {string} toolName
 * @param {() => Promise<T>} run
 * @returns {Promise<T>}
 */
export async function runWithOptionalRetry(toolName, run) {
  if (!isToolRetryEnabled(toolName)) {
    return run();
  }

  const maxRetries = getToolRetryMaxAttempts();
  const delayMs = getToolRetryDelayMs();
  let lastResult;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await run();
      if (!isTransientDispatchFailure(result) || attempt >= maxRetries) {
        return result;
      }
      lastResult = result;
    } catch (err) {
      if (attempt >= maxRetries) throw err;
      if (process.env.NODE_ENV !== 'production') {
        console.log(
          `[ToolDispatcher] retry ${attempt + 1}/${maxRetries} for ${toolName}: ${err?.message ?? err}`,
        );
      }
      await sleep(delayMs * (attempt + 1));
      continue;
    }

    if (process.env.NODE_ENV !== 'production') {
      const code = lastResult?.error?.code ?? lastResult?.blocker?.code ?? 'unknown';
      console.log(
        `[ToolDispatcher] retry ${attempt + 1}/${maxRetries} for ${toolName} (transient: ${code})`,
      );
    }
    await sleep(delayMs * (attempt + 1));
  }

  return lastResult;
}

/** Reset cached env parse (tests). */
export function resetToolDispatchRetryCacheForTests() {
  retryableToolsCache = null;
}
