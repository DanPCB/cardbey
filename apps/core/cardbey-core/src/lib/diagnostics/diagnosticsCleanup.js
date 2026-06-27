/**
 * Diagnostics retention — prevent FrontendError table from growing without bound.
 */

import { getPrismaClient } from '../prisma.js';

function hasFrontendErrorModel(prisma) {
  return Boolean(prisma?.frontendError?.deleteMany);
}

/**
 * @param {{ retentionHours?: number }} [options]
 */
export async function cleanupOldDiagnostics(options = {}) {
  const retentionHours = Number(options.retentionHours ?? process.env.DIAGNOSTICS_RETENTION_HOURS ?? 24);
  const hours = Number.isFinite(retentionHours) && retentionHours > 0 ? retentionHours : 24;
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  const prisma = getPrismaClient();

  if (!hasFrontendErrorModel(prisma)) {
    return { deleted: 0, skipped: 'model_unavailable', cutoff: cutoff.toISOString() };
  }

  const result = await prisma.frontendError.deleteMany({
    where: { timestamp: { lt: cutoff } },
  });

  console.log(`[DIAGNOSTICS] Cleaned ${result.count} frontend errors older than ${hours}h`);
  return { deleted: result.count, cutoff: cutoff.toISOString(), retentionHours: hours };
}

/**
 * @param {number} [intervalMs]
 */
export function startDiagnosticsCleanup(intervalMs = 60 * 60 * 1000) {
  const run = () => {
    cleanupOldDiagnostics().catch((err) => {
      console.warn('[DIAGNOSTICS] cleanup failed (non-fatal):', err?.message ?? err);
    });
  };
  run();
  const interval = setInterval(run, intervalMs);
  if (typeof interval.unref === 'function') interval.unref();
  return { stop: () => clearInterval(interval) };
}
