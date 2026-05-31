/**
 * User-ended / dismissed mission detection for runtime session recovery.
 */

import { isTerminalMissionPipelineStatus } from '../missionPipelineTerminalStatus.js';

function asObj(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

const USER_ENDED_STATUSES = new Set(['cancelled', 'canceled', 'dismissed', 'ended']);

/**
 * @param {{ status?: unknown; runState?: unknown; metadataJson?: unknown }} row
 * @returns {boolean}
 */
export function isMissionEndedByUser(row) {
  if (!row) return false;
  const meta = asObj(row.metadataJson);
  if (meta.endedByUser === true) return true;
  const st = str(row.status).toLowerCase();
  if (USER_ENDED_STATUSES.has(st)) return true;
  if (isTerminalMissionPipelineStatus(st, { runState: row.runState }) && USER_ENDED_STATUSES.has(st)) {
    return true;
  }
  return false;
}

/**
 * @param {object} existingMeta
 * @returns {object}
 */
export function buildEndedByUserMetadata(existingMeta) {
  const meta = asObj(existingMeta);
  const next = { ...meta, endedByUser: true, endedAt: new Date().toISOString() };
  delete next.checkpointContinuation;
  delete next.continuationPayload;
  return next;
}
