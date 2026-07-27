/**
 * Performer Runtime — unified operational stream (Phase 1.5-C).
 * Blackboard is an event source, not a parallel execution authority.
 */

import { appendEvent, getEvents } from '../../missionBlackboard.js';
import { broadcastSse } from '../../../realtime/simpleSse.js';
import { isPerformerRuntimeUnifiedStreamEnabled } from './runtimeFlags.js';

/** @typedef {'execution'|'telemetry'|'approval'|'pipeline'|'orchestration'|'artifact'|'failure'|'lifecycle'} RuntimeStreamCategory */

/**
 * @param {string} eventType
 * @returns {RuntimeStreamCategory}
 */
export function categorizeStreamEvent(eventType) {
  const et = typeof eventType === 'string' ? eventType : '';
  if (et.startsWith('runtime.execution') || et === 'completed_action' || et === 'step_output') {
    return 'execution';
  }
  if (et.startsWith('runtime.telemetry') || et === 'reasoning_line') return 'telemetry';
  if (et.startsWith('runtime.approval') || et === 'approval_required') return 'approval';
  if (et.startsWith('runtime.pipeline') || et === 'plan_proposed') return 'pipeline';
  if (et.startsWith('runtime.orchestration') || et.startsWith('runtime.graph') || et.startsWith('runtime.worker') || et.startsWith('runtime.skill') || et.startsWith('runtime.queue') || et.startsWith('runtime.lease') || et.startsWith('runtime.replay') || et.startsWith('runtime.node') || et === 'handoff') return 'orchestration';
  if (et.startsWith('runtime.artifact')) return 'artifact';
  if (et.startsWith('runtime.failure')) return 'failure';
  return 'lifecycle';
}

/**
 * Normalize blackboard row to unified stream event.
 *
 * @param {object} row
 */
export function normalizeStreamEvent(row) {
  const eventType = row.eventType ?? 'unknown';
  return {
    id: row.id,
    seq: row.seq,
    eventType,
    category: categorizeStreamEvent(eventType),
    source: eventType.startsWith('runtime.') ? 'performer_runtime' : 'blackboard',
    missionId: row.missionId ?? null,
    agentId: row.agentId ?? null,
    correlationId: row.correlationId ?? null,
    payload: row.payload ?? {},
    createdAt: row.createdAt,
  };
}

/**
 * @param {{
 *   missionId: string;
 *   runtimeId?: string|null;
 *   eventType: string;
 *   payload?: object;
 *   agentId?: string|null;
 * }} opts
 */
export async function emitRuntimeStreamEvent(opts) {
  const mid = typeof opts.missionId === 'string' ? opts.missionId.trim() : '';
  if (!mid || !isPerformerRuntimeUnifiedStreamEnabled()) {
    return { ok: false, reason: 'stream_disabled_or_no_mission' };
  }

  const eventType =
    typeof opts.eventType === 'string' && opts.eventType.startsWith('runtime.')
      ? opts.eventType.trim()
      : `runtime.${opts.eventType}`;

  const payload = {
    ...(opts.payload && typeof opts.payload === 'object' ? opts.payload : {}),
    runtimeId: opts.runtimeId ?? null,
    unifiedStream: true,
  };

  const appended = await appendEvent(mid, eventType, payload, {
    agentId: opts.agentId ?? 'performer_runtime',
  });

  if (appended.ok) {
    broadcastSse('agent-chat', 'runtime.stream', {
      missionId: mid,
      seq: appended.seq,
      eventType,
      category: categorizeStreamEvent(eventType),
      payload,
    });
  }

  return appended;
}

/**
 * Merged timeline: blackboard events normalized to unified stream shape.
 *
 * @param {string} missionId
 * @param {{ afterSeq?: number, limit?: number }} [opts]
 */
export async function getUnifiedRuntimeStream(missionId, opts = {}) {
  const { events, error } = await getEvents(missionId, opts);
  if (error) {
    return { events: [], error };
  }
  return {
    events: events.map((e) =>
      normalizeStreamEvent({
        ...e,
        missionId,
      }),
    ),
  };
}
