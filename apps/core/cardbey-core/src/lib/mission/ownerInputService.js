/**
 * ownerInputService — submit owner clarification fields and resume topology.
 */

import { resumeTopologyFromOwnerInput } from './topologyExecutor.js';

/**
 * Submit owner input for a mission paused on needs_input / awaiting_owner_input.
 *
 * @param {string} missionId
 * @param {Record<string, unknown>} fields
 * @param {{ userId?: string | null }} [opts]
 */
export async function submitOwnerInput(missionId, fields, opts = {}) {
  const mid = String(missionId ?? '').trim();
  if (!mid) {
    return { ok: false, error: 'validation', message: 'missionId is required' };
  }
  const body = fields && typeof fields === 'object' && !Array.isArray(fields) ? fields : null;
  if (!body || !Object.keys(body).length) {
    return { ok: false, error: 'validation', message: 'fields are required' };
  }

  try {
    const result = await resumeTopologyFromOwnerInput(mid, body, {
      userId: opts.userId ?? undefined,
    });
    return {
      ok: result.ok !== false,
      status: result.status,
      missionId: mid,
      executionMode: result.executionMode,
      metadata: result.metadata,
      nodeRun: result.nodeRun,
      missingFields: result.nodeRun?.missingFields ?? result.metadata?.missingFields ?? [],
      pendingNodeId: result.nodeRun?.pendingNodeId ?? result.metadata?.pendingNodeId ?? null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const notAwaiting = /not awaiting owner input/i.test(message);
    return {
      ok: false,
      error: notAwaiting ? 'conflict' : 'resume_failed',
      message,
    };
  }
}
