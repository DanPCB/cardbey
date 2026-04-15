import { prisma } from '../prisma.js';

/**
 * Fire-and-forget health probe emitter.
 *
 * Never throws; all errors are swallowed.
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

    void prisma.telemetryProbe
      .create({
        data: {
          tag: t,
          status,
          missionId: missionIdRaw || null,
          payload: d,
        },
      })
      .catch(() => {});
  } catch {
    // never throw
  }
}

