/**
 * Non-critical write queue for SQLite contention relief.
 *
 * Telemetry, device logs, LLM cache, and presence writes are fire-and-forget
 * but still hit SQLite concurrently with mission-critical writes (blackboard,
 * mission state). This queue serializes them with a short delay so they don't
 * contend with high-priority writes during campaign orchestration.
 *
 * Usage:
 *   import { enqueueWrite } from './sqliteWriteQueue.js';
 *   enqueueWrite(() => prisma.telemetryProbe.create({ data: { ... } }), 'telemetryProbe');
 *
 * Critical writes (blackboard, mission state, artifact) should NOT use this queue.
 * They should be awaited directly so failures surface immediately.
 */

import { isPrismaSocketTimeoutError, isSqliteBusyError } from './orchestration/orchestrationStabilityMetrics.js';
import { isSqliteAuthorityWriteInFlight } from './sqliteWriteLane.js';

const QUEUE_INTERVAL_MS = 50; // Drain interval — how often to flush
const MAX_BATCH_SIZE = 10; // Max writes per drain cycle
const MAX_QUEUE_SIZE = 500; // Drop oldest if queue exceeds this

/** @type {Array<{ fn: () => Promise<any>, label: string }>} */
const queue = [];
let draining = false;
let drainInterval = null;

/**
 * Enqueue a non-critical write.
 * @param {() => Promise<any>} fn Async write function
 * @param {string} [label] For logging (e.g. 'telemetryProbe', 'deviceLog')
 */
export function enqueueWrite(fn, label = 'unknown') {
  if (queue.length >= MAX_QUEUE_SIZE) {
    const dropped = queue.shift();
    console.debug(`[WriteQueue] dropped oldest entry (${dropped?.label}) — queue full`);
  }
  queue.push({ fn, label });
  ensureDraining();
}

/**
 * Enqueue and await result (for paths that need a return value, e.g. device heartbeat).
 *
 * @param {() => Promise<T>} fn
 * @param {string} [label]
 * @returns {Promise<T>}
 * @template T
 */
export function enqueueWriteAwait(fn, label = 'unknown') {
  return new Promise((resolve, reject) => {
    enqueueWrite(async () => {
      try {
        resolve(await fn());
      } catch (err) {
        reject(err);
      }
    }, label);
  });
}

function ensureDraining() {
  if (drainInterval) return;
  drainInterval = setInterval(drain, QUEUE_INTERVAL_MS);
}

function logWriteQueueFailure(err, label) {
  if (isPrismaSocketTimeoutError(err)) {
    console.warn(`[WriteQueue] P1008 (${label}): ${err?.message || err}`);
    return;
  }
  if (isSqliteBusyError(err)) {
    console.warn(`[WriteQueue] SQLITE_BUSY (${label}): ${err?.message || err}`);
    return;
  }
  const msg = err?.message ?? String(err);
  if (process.env.NODE_ENV !== 'production') {
    console.debug(`[WriteQueue] write failed (${label}):`, msg);
  }
}

async function drain() {
  if (draining || queue.length === 0) return;
  if (isSqliteAuthorityWriteInFlight()) return;
  draining = true;

  const batch = queue.splice(0, MAX_BATCH_SIZE);

  for (const { fn, label } of batch) {
    if (isSqliteAuthorityWriteInFlight()) {
      queue.unshift({ fn, label });
      continue;
    }
    try {
      await fn();
    } catch (err) {
      logWriteQueueFailure(err, label);
    }
  }

  draining = false;

  if (queue.length === 0 && drainInterval) {
    clearInterval(drainInterval);
    drainInterval = null;
  }
}

/** Queue depth — useful for monitoring */
export function getWriteQueueDepth() {
  return queue.length;
}

/** True while a drain batch is in flight */
export function isWriteQueueDraining() {
  return draining;
}

/** Flush all pending writes — call on graceful shutdown */
export async function flushWriteQueue() {
  if (drainInterval) {
    clearInterval(drainInterval);
    drainInterval = null;
  }
  while (queue.length > 0) {
    await drain();
  }
}
