/**
 * Dev/staging timing probes for store draft pipeline phases.
 * Never throws; does not log secrets or full prompts.
 */

function missionIdForLog(missionId) {
  const mid = String(missionId ?? '').trim();
  return mid || 'unknown';
}

/**
 * @param {string|null|undefined} missionId
 * @returns {{ start: (phase: string) => void, end: (phase: string) => void, mark: (phase: string, durationMs: number) => void }}
 */
export function createStoreBuildTiming(missionId) {
  const mid = missionIdForLog(missionId);
  /** @type {Map<string, number>} */
  const startedAt = new Map();

  const log = (phase, durationMs) => {
    const ms = Number(durationMs);
    if (!Number.isFinite(ms) || ms < 0) return;
    console.log(`[StoreBuildTiming] missionId=${mid} phase=${phase} durationMs=${Math.round(ms)}`);
  };

  return {
    start(phase) {
      const p = String(phase ?? '').trim();
      if (!p) return;
      startedAt.set(p, Date.now());
    },
    end(phase) {
      const p = String(phase ?? '').trim();
      if (!p) return;
      const t0 = startedAt.get(p);
      if (t0 == null) return;
      startedAt.delete(p);
      log(p, Date.now() - t0);
    },
    mark(phase, durationMs) {
      const p = String(phase ?? '').trim();
      if (!p) return;
      log(p, durationMs);
    },
  };
}
