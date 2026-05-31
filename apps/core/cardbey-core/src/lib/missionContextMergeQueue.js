/**
 * Deferred Mission.context merge queue (non-critical metadata under SQLite pressure).
 * Best-effort: never blocks mission or pipeline FSM paths.
 */

import { getPrismaClient } from './prisma.js';

/** @type {Map<string, object>} */
const pendingPatches = new Map();

let flushTimer = null;
const FLUSH_DELAY_MS = 1500;

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushMissionContextMergeQueue().catch(() => {});
  }, FLUSH_DELAY_MS);
}

function deepMerge(target, source) {
  const out = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] != null &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      out[key] != null &&
      typeof out[key] === 'object' &&
      !Array.isArray(out[key])
    ) {
      out[key] = deepMerge(out[key], source[key]);
    } else {
      out[key] = source[key];
    }
  }
  return out;
}

/**
 * @param {string} missionId
 * @param {object} patch
 */
export function enqueueMissionContextMerge(missionId, patch) {
  const id = String(missionId ?? '').trim();
  if (!id || !patch || typeof patch !== 'object' || Array.isArray(patch)) return;
  const existing = pendingPatches.get(id) ?? {};
  pendingPatches.set(id, deepMerge(existing, patch));
  scheduleFlush();
}

export async function flushMissionContextMergeQueue() {
  if (pendingPatches.size === 0) return;
  const batch = new Map(pendingPatches);
  pendingPatches.clear();
  const prisma = getPrismaClient();
  const { mergeMissionContext } = await import('./mission.js');
  for (const [missionId, patch] of batch) {
    try {
      await mergeMissionContext(missionId, patch, { prisma });
    } catch (e) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[missionContextMergeQueue] flush failed:', missionId, e?.message || e);
      }
    }
  }
}

/** @internal tests */
export function resetMissionContextMergeQueueForTests() {
  pendingPatches.clear();
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}
