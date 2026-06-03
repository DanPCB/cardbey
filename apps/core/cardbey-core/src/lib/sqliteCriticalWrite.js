/**
 * Critical SQLite writes — authority lane + P1008 retry (mission FSM, blackboard, orchestrator tasks).
 */

import { isPerformerSqliteRuntimeWriteSerializationEnabled } from './broker/brokerFlags.js';
import { isPrismaSocketTimeoutError, sleep } from './orchestration/orchestrationStabilityMetrics.js';
import { runSqliteAuthorityWrite } from './sqliteWriteLane.js';

const DEFAULT_P1008_MAX_ATTEMPTS = 3;
const P1008_BASE_BACKOFF_MS = 50;

/**
 * @param {() => Promise<T>} fn
 * @param {{ label?: string, maxAttempts?: number, logPrefix?: string, retryLog?: (attempt: number) => string }} [opts]
 * @returns {Promise<T>}
 * @template T
 */
export async function runCriticalSqliteWriteWithP1008Retry(fn, opts = {}) {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_P1008_MAX_ATTEMPTS;
  const logPrefix = opts.logPrefix ?? '[criticalSqliteWrite]';
  const label = opts.label ?? 'critical';

  const runWithRetry = async () => {
    let attempt = 0;
    while (true) {
      attempt += 1;
      try {
        return await fn();
      } catch (err) {
        if (!isPrismaSocketTimeoutError(err) || attempt >= maxAttempts) {
          throw err;
        }
        const msg =
          typeof opts.retryLog === 'function'
            ? opts.retryLog(attempt)
            : `${logPrefix} retry P1008 attempt=${attempt} label=${label}`;
        console.warn(msg);
        await sleep(P1008_BASE_BACKOFF_MS * 2 ** (attempt - 1));
      }
    }
  };

  if (isPerformerSqliteRuntimeWriteSerializationEnabled()) {
    return runSqliteAuthorityWrite(() => runWithRetry(), label);
  }
  return runWithRetry();
}

/**
 * @param {() => Promise<T>} fn
 * @param {string} [label]
 * @returns {Promise<T>}
 * @template T
 */
export function runCriticalSqliteWrite(fn, label = 'critical') {
  if (isPerformerSqliteRuntimeWriteSerializationEnabled()) {
    return runSqliteAuthorityWrite(fn, label);
  }
  return fn();
}
