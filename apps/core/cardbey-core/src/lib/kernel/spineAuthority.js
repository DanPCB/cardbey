/**
 * One-spine-per-mission authority helpers.
 */

import { readMetadata, writeMetadata } from '../persistence/metadataWriter.js';

export const SPINE_OWNERS = Object.freeze({
  COMPILER_TOPOLOGY: 'compiler_topology',
  CHECKPOINT: 'checkpoint',
  RUNTIME: 'runtime',
  INTAKE_ONLY: 'intake_only',
});

export class MissionSpineAssertionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MissionSpineAssertionError';
    this.code = code;
  }
}

function pickString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function readMissionSpineOwnership(missionId) {
  const meta = await readMetadata(missionId);
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;
  return meta.spineOwnership ?? null;
}

export function assertMissionSpineOwnership(existing, claimedOwner, details = {}) {
  const owner = pickString(existing?.owner);
  const claimed = pickString(claimedOwner);
  if (!owner || !claimed || owner === claimed) return;
  throw new MissionSpineAssertionError(
    'MISSION_SPINE_LOCKED',
    `Mission spine already owned by ${owner}; ${claimed} cannot take over (${details.missionId ?? 'unknown mission'})`,
  );
}

export async function claimMissionSpineOwnership(missionId, owner, details = {}) {
  const claimed = pickString(owner);
  if (!claimed) return null;
  const existing = await readMissionSpineOwnership(missionId);
  if (existing) {
    assertMissionSpineOwnership(existing, claimed, { ...details, missionId });
    return existing;
  }
  const spineOwnership = Object.freeze({
    owner: claimed,
    claimedAt: new Date().toISOString(),
    source: pickString(details.source) ?? null,
    tool: pickString(details.tool) ?? null,
    missionFamily: pickString(details.missionFamily) ?? null,
  });
  await writeMetadata(missionId, { spineOwnership });
  return spineOwnership;
}
