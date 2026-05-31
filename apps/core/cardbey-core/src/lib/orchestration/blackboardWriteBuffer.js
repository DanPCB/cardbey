/**
 * Orchestration blackboard adapter — forwards to MissionBlackboard.
 * In-memory batching when PERFORMER_BLACKBOARD_BATCHING is ON (default OFF).
 */

import { appendEvent, appendEventBatch } from '../missionBlackboard.js';

function envTruthy(name) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') return false;
  const v = String(raw).trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function isBatchingEnabled() {
  return envTruthy('PERFORMER_BLACKBOARD_BATCHING');
}

/**
 * @param {string} missionId
 * @returns {{
 *   missionId: string,
 *   appendEvent: typeof appendEvent,
 *   appendEventBatch: typeof appendEventBatch,
 *   flushOrchestrationEvents: () => Promise<void>,
 * }}
 */
export function createOrchestrationBlackboard(missionId) {
  const mid = String(missionId ?? '').trim();
  /** @type {Array<{ eventType: string, payload: unknown, opts: object }>} */
  const queue = [];
  const batching = isBatchingEnabled();

  const flushQueued = async (targetId = mid) => {
    if (!queue.length) return;
    const firstOpts = queue[0]?.opts ?? {};
    const batch = queue.splice(0, queue.length).map((e) => ({
      eventType: e.eventType,
      payload: e.payload,
      ...(e.opts?.agentId != null ? { agentId: e.opts.agentId } : {}),
    }));
    await appendEventBatch(targetId, batch, firstOpts);
  };

  return {
    missionId: mid,
    async appendEvent(id, eventType, payload, opts = {}) {
      const target = String(id ?? mid).trim();
      if (!target) return null;
      if (batching) {
        queue.push({ eventType, payload, opts });
        return null;
      }
      return appendEvent(target, eventType, payload, opts);
    },
    async appendEventBatch(id, events, opts = {}) {
      return appendEventBatch(String(id ?? mid).trim(), events, opts);
    },
    async flushOrchestrationEvents() {
      if (batching) await flushQueued(mid);
    },
  };
}
