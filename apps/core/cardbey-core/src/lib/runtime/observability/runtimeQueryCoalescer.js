/**
 * Phase 2.3-C — in-flight query coalescing.
 * Prevents multiple simultaneous identical reads (blackboard/state/governance) from hitting SQLite N times.
 * Read-only; no execution authority.
 */

import { recordCoalescedQuery } from './runtimeObservabilityMetrics.js';

/** @type {Map<string, Promise<any>>} */
const inFlight = new Map();

/**
 * Coalesce concurrent identical reads. If a promise for `key` is already running,
 * return it (and count an avoided DB read) instead of issuing a duplicate query.
 *
 * @template T
 * @param {string} key stable identity for the read (e.g. `snapshot:<missionId>`)
 * @param {() => Promise<T>} producer
 * @returns {Promise<T>}
 */
export function coalesce(key, producer) {
  const k = typeof key === 'string' && key.trim() ? key.trim() : null;
  if (!k) return Promise.resolve().then(producer);

  const existing = inFlight.get(k);
  if (existing) {
    recordCoalescedQuery(1);
    return existing;
  }

  let p;
  try {
    p = Promise.resolve().then(producer);
  } catch (e) {
    return Promise.reject(e);
  }
  inFlight.set(k, p);
  return p.finally(() => {
    if (inFlight.get(k) === p) inFlight.delete(k);
  });
}

export function getInFlightCount() {
  return inFlight.size;
}

export function resetCoalescerForTests() {
  inFlight.clear();
}
