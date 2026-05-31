/**
 * Phase 2.3-E — debounced best-effort Mission.context / runtime snapshot persists.
 * Critical pipeline FSM writes do not use this queue.
 */

const DEBOUNCE_MS = 2000;

/** @type {Map<string, { timer: ReturnType<typeof setTimeout> | null, run: () => Promise<void>, label?: string }>} */
const snapshotQueue = new Map();

/**
 * @param {string} missionId
 * @param {() => Promise<void>} run
 * @param {{ label?: string }} [opts]
 */
export function queueRuntimeSnapshotPersist(missionId, run, opts = {}) {
  const mid = String(missionId ?? '').trim();
  if (!mid || typeof run !== 'function') return;

  const existing = snapshotQueue.get(mid);
  if (existing?.timer) clearTimeout(existing.timer);

  const entry = {
    run,
    label: opts.label,
    timer: setTimeout(() => {
      snapshotQueue.delete(mid);
      void run().catch(() => {});
    }, DEBOUNCE_MS),
  };
  snapshotQueue.set(mid, entry);
}

/** @internal tests */
export function resetMissionWriteQueueForTests() {
  for (const entry of snapshotQueue.values()) {
    if (entry.timer) clearTimeout(entry.timer);
  }
  snapshotQueue.clear();
}
