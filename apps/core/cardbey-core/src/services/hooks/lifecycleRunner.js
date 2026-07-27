/**
 * Lifecycle Runner — orchestrates pre/post/error/retry/timeout/rollback hooks around execution.
 */

import hookExecutor from './hookExecutor.js';
import hookRegistry from './hookRegistry.js';
import { stashRollbackSnapshot } from './hookMetrics.js';

function isTimeoutError(error) {
  const msg = String(error?.message ?? error ?? '').toLowerCase();
  return msg.includes('timed out') || msg.includes('timeout') || error?.name === 'AbortError';
}

/**
 * @param {string} skillId
 * @param {object} context
 * @param {() => Promise<object>} executor
 * @param {{ maxRetries?: number; captureRollback?: boolean }} [options]
 */
export async function executeWithLifecycleHooks(skillId, context, executor, options = {}) {
  const sid = String(skillId ?? '').trim() || 'unknown';
  const startTime = Date.now();
  const hookContext = {
    ...context,
    skillId: sid,
    startTime,
  };

  if (options.captureRollback !== false && hookContext.storeId && hookContext.originalState == null) {
    stashRollbackSnapshot(`store:${hookContext.storeId}`, hookContext.preSnapshot ?? {});
  }

  try {
    await hookExecutor.executePreHooks(sid, hookContext);

    const result = await runWithRetry(sid, hookContext, executor, options);

    const enriched = {
      ...result,
      duration: Date.now() - startTime,
    };
    hookContext.result = enriched;

    await hookExecutor.executePostHooks(sid, hookContext, enriched);
    await hookExecutor.executeCompleteHooks(sid, hookContext, enriched, null);

    return enriched;
  } catch (error) {
    hookContext.error = error;

    await hookExecutor.executeErrorHooks(sid, hookContext, error).catch(() => {});

    if (isTimeoutError(error)) {
      await hookExecutor.executeTimeoutHooks(sid, hookContext).catch(() => {});
    }

    await hookExecutor.executeRollbackHooks(sid, hookContext, error).catch(() => {});
    await hookExecutor.executeCompleteHooks(sid, hookContext, null, error).catch(() => {});

    throw error;
  }
}

/**
 * @param {string} skillId
 * @param {object} hookContext
 * @param {() => Promise<object>} executor
 * @param {{ maxRetries?: number }} options
 */
async function runWithRetry(skillId, hookContext, executor, options = {}) {
  const retryHooks = hookRegistry.getRetryHooks(skillId);
  const configuredMax = Math.max(0, Number(options.maxRetries) || 0);
  const maxAttempts = Math.max(1, configuredMax || (retryHooks.length ? 3 : 1));

  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (attempt > 1) {
        await hookExecutor.executeRetryHooks(skillId, { ...hookContext, attempt }, attempt);
      }
      return await executor();
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts) break;
      const backoffMs = Math.min(5000, 250 * 2 ** (attempt - 1));
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }

  throw lastError || new Error('Execution failed');
}

export default { executeWithLifecycleHooks };
