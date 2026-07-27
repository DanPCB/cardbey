/**
 * Phase 2.3-C — stream-first write-path hook.
 *
 * Fire-and-forget bridge: when a blackboard/runtime event is appended, push it into the
 * mission replay buffer + invalidate the cached snapshot so the next read is incremental.
 *
 * SAFETY: flag-gated (PERFORMER_STREAM_FIRST_RUNTIME, default OFF), fully synchronous and
 * try/catch-wrapped, never throws into the runtime write loop, never awaits DB.
 */

import { isPerformerStreamFirstRuntimeEnabled } from '../../broker/brokerFlags.js';
import { recordStreamEvent } from './missionRuntimeSnapshotCache.js';

/**
 * @param {string} missionId
 * @param {{ seq?: number|null, eventType: string, payload?: any }} event
 */
export function onRuntimeEventAppended(missionId, event) {
  if (!isPerformerStreamFirstRuntimeEnabled()) return;
  try {
    recordStreamEvent(missionId, event);
  } catch {
    // never propagate into the runtime write path
  }
}
