import { prisma } from '../prisma.js';
import { isDiagnosticTelemetryTag, PERSISTENCE_CATEGORY } from './persistenceClassification.js';

/** Per tag+mission debounce window for diagnostic probes (ms). */
const DIAGNOSTIC_DEBOUNCE_MS = 5_000;

/** Max queued diagnostic writes before dropping oldest. */
const MAX_DIAGNOSTIC_QUEUE = 64;

/** @type {Map<string, number>} */
const diagnosticLastEmitAt = new Map();

/** @type {Array<{ tag: string, status: string, missionId: string | null, payload: object }>} */
const diagnosticQueue = [];

let diagnosticFlushScheduled = false;
let diagnosticFlushInFlight = false;

function debounceKey(tag, missionId) {
  return `${tag}::${missionId ?? ''}`;
}

function scheduleDiagnosticFlush() {
  if (diagnosticFlushScheduled) return;
  diagnosticFlushScheduled = true;
  setImmediate(() => {
    diagnosticFlushScheduled = false;
    void flushDiagnosticQueue();
  });
}

async function flushDiagnosticQueue() {
  if (diagnosticFlushInFlight) return;
  diagnosticFlushInFlight = true;
  try {
    while (diagnosticQueue.length > 0) {
      const item = diagnosticQueue.shift();
      if (!item) continue;
      try {
        await prisma.telemetryProbe.create({
          data: {
            tag: item.tag,
            status: item.status,
            missionId: item.missionId,
            payload: item.payload,
          },
        });
      } catch {
        /* timeout / SQLITE_BUSY — never propagate */
      }
    }
  } finally {
    diagnosticFlushInFlight = false;
    if (diagnosticQueue.length > 0) scheduleDiagnosticFlush();
  }
}

function enqueueDiagnosticProbe(tag, status, missionId, payload) {
  const key = debounceKey(tag, missionId);
  const now = Date.now();
  const last = diagnosticLastEmitAt.get(key) ?? 0;
  if (now - last < DIAGNOSTIC_DEBOUNCE_MS) return;
  diagnosticLastEmitAt.set(key, now);

  if (diagnosticQueue.length >= MAX_DIAGNOSTIC_QUEUE) {
    diagnosticQueue.shift();
  }
  diagnosticQueue.push({ tag, status, missionId, payload });
  scheduleDiagnosticFlush();
}

/**
 * Fire-and-forget health probe emitter.
 *
 * Never throws; all errors are swallowed.
 * Diagnostic tags are debounced and queued (SQLite-safe).
 *
 * @param {string} tag
 * @param {Record<string, unknown>} data
 * @returns {void}
 */
export function emitHealthProbe(tag, data = {}) {
  try {
    const t = typeof tag === 'string' ? tag.trim() : '';
    if (!t) return;

    const d = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    const missionIdRaw = typeof d.missionId === 'string' ? d.missionId.trim() : '';
    const statusRaw = typeof d.status === 'string' ? d.status.trim().toLowerCase() : '';
    const status = statusRaw === 'pass' || statusRaw === 'fail' || statusRaw === 'warn' ? statusRaw : 'pass';
    const missionId = missionIdRaw || null;

    const category = isDiagnosticTelemetryTag(t)
      ? PERSISTENCE_CATEGORY.DIAGNOSTIC
      : PERSISTENCE_CATEGORY.EVENTUAL;

    if (category === PERSISTENCE_CATEGORY.DIAGNOSTIC) {
      enqueueDiagnosticProbe(t, status, missionId, d);
      return;
    }

    void prisma.telemetryProbe
      .create({
        data: {
          tag: t,
          status,
          missionId,
          payload: d,
        },
      })
      .catch(() => {});
  } catch {
    // never throw
  }
}

/** @internal test helper */
export function resetHealthProbeQueueForTests() {
  diagnosticQueue.length = 0;
  diagnosticLastEmitAt.clear();
  diagnosticFlushScheduled = false;
  diagnosticFlushInFlight = false;
}
