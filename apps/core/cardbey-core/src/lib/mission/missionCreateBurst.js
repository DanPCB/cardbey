/**
 * Phase 2.3-F2 — mission create burst hardening (optional serialization wrapper).
 * Default: pass-through so creation behavior matches legacy when flags are OFF.
 */

import { isPerformerMissionCreateBurstHardeningEnabled } from '../broker/brokerFlags.js';

/**
 * @template T
 * @param {'pipeline'|'bundle'} _kind
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function runMissionCreateBurst(_kind, fn) {
  if (!isPerformerMissionCreateBurstHardeningEnabled()) {
    return fn();
  }
  // Optional authority lane (2.3-F) is not wired in this build — run inline to preserve semantics.
  return fn();
}
